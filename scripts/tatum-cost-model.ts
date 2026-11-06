// Measures what CALIBRE actually spends on Tatum, per user action and per watcher pass, by calling the real code paths and
// reading Tatum's listed prices for each request. Then projects how long a credit allowance lasts at several traffic levels.
//   node node_modules/tsx/dist/cli.mjs scripts/tatum-cost-model.ts [--allowance 2000000] [--days 11]
//
// It spends real credits (roughly 1,500 for a full run) because the point is measured cost, not arithmetic. Prints costs,
// timings and whether each call returned usable data; never the key and never the data.
import "./env.js";
import { TATUM_CREDITS, creditCost } from "../packages/chain/src/credits.js";

const KEY = process.env.TATUM_API_KEY?.trim();
if (!KEY) { console.error("TATUM_API_KEY is not set."); process.exit(1); }
const API = "https://api.tatum.io/v4/data/prediction";

const args = new Map<string, string>();
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(argv[i]!);
    if (!m) continue;
    // Accept both --flag=value and --flag value.
    const next = argv[i + 1];
    if (m[2] !== undefined) args.set(m[1]!, m[2]);
    else if (next && !next.startsWith("--")) { args.set(m[1]!, next); i++; }
    else args.set(m[1]!, "true");
  }
}
const ALLOWANCE = Number(args.get("allowance") ?? 2_000_000);
const DAYS = Number(args.get("days") ?? 11);

let spent = 0;
const calls: { label: string; path: string; credits: number; status: number; usable: boolean; note: string; ms: number }[] = [];

async function call(label: string, path: string, usableOf: (body: unknown) => { usable: boolean; note: string }) {
  const price = creditCost(path);
  const t = Date.now();
  let status = 0, body: unknown = null;
  try {
    const r = await fetch(`${API}${path}`, { headers: { "x-api-key": KEY! } });
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (e) { calls.push({ label, path, credits: 0, status: 0, usable: false, note: `network: ${e instanceof Error ? e.message : e}`, ms: Date.now() - t }); return null; }
  spent += price;
  const { usable, note } = status === 200 ? usableOf(body) : { usable: false, note: `HTTP ${status}` };
  calls.push({ label, path, credits: price, status, usable, note, ms: Date.now() - t });
  return body as { data?: unknown } | null;
}

const iso = (ms: number) => new Date(ms).toISOString();
const now = Date.now();
const rows = (b: unknown) => { const d = (b as { data?: unknown })?.data; return Array.isArray(d) ? d.length : 0; };

const PROBE = args.get("no-probe") !== "true";
console.log(PROBE
  ? "Measuring every Tatum call CALIBRE makes. Prices are Tatum's listed credit prices per request.\n"
  : "--no-probe: skipping the live calls, printing the cost model only (spends nothing).\n");

// --- 1. The calls behind a market X-ray -------------------------------------------------------------------------------
const ev = PROBE ? await call("events (discovery / market lookup)", "/events?sort=volume_desc&limit=20", (b) => ({ usable: rows(b) > 0, note: `${rows(b)} events` })) : null;
let market: string | null = PROBE ? null : "0x" + "0".repeat(64);
for (const e of ((ev?.data ?? []) as { markets?: unknown[] }[])) {
  const ids = (e.markets ?? []).filter((m): m is string => typeof m === "string" && /^0x[0-9a-f]{64}$/i.test(m));
  if (ids.length) { market = ids[0]!; break; }
}
if (!market) { console.error("no market id in the events response"); process.exit(1); }

if (PROBE) await call("market by id (status, volume, live price)", `/markets/${market}`, (b) => {
  const d = (b as { data?: { status?: string; volume?: number } })?.data;
  return { usable: typeof d?.volume === "number", note: `status ${d?.status}, volume ${d?.volume?.toFixed?.(0) ?? "?"}` };
});
if (PROBE) await call("live price", `/markets/${market}/price`, (b) => {
  const d = (b as { data?: Record<string, unknown> })?.data;
  return { usable: !!d && Object.keys(d).length > 0, note: d ? Object.keys(d).join(",") : "empty" };
});
if (PROBE) await call("price history, midpoint (the move gate)", `/markets/${market}/history?interval=5m&start=${iso(now - 2 * 3600e3)}&end=${iso(now)}&source=midpoint`, (b) => {
  const c = (b as { data?: { candles?: unknown[] } })?.data?.candles ?? [];
  return { usable: c.length > 0, note: `${c.length} candles` };
});
if (PROBE) await call("price history, candlesticks (Tatum's default)", `/markets/${market}/history?interval=5m&start=${iso(now - 2 * 3600e3)}&end=${iso(now)}&source=candlesticks`, (b) => {
  const c = (b as { data?: { candles?: unknown[] } })?.data?.candles ?? [];
  return { usable: c.length > 0, note: `${c.length} candles` };
});
if (PROBE) await call("market trades, page 1 (fills behind a move)", `/markets/${market}/trades?limit=100`, (b) => ({ usable: rows(b) > 0, note: `${rows(b)} fills` }));

// --- 2. The calls behind a wallet X-ray -------------------------------------------------------------------------------
const WALLET = process.env.PROBE_WALLET || "0x9794fd814d590109b007f1a7c58a4de7b9de625e";
if (PROBE) await call("wallet open-position value", `/wallets/${WALLET}/value`, (b) => {
  const v = (b as { data?: { value?: number } })?.data?.value;
  return { usable: typeof v === "number", note: typeof v === "number" ? `value ${v}` : "no value" };
});
if (PROBE) await call("wallet markets-traded count", `/wallets/${WALLET}/markets-traded`, (b) => {
  const v = (b as { data?: { traded?: number } })?.data?.traded;
  return { usable: typeof v === "number", note: typeof v === "number" ? `traded ${v}` : "no count" };
});
if (PROBE) await call("wallet portfolio", `/wallets/${WALLET}/portfolio`, (b) => {
  const d = (b as { data?: Record<string, number> })?.data ?? {};
  const allZero = (d.activeNotional ?? 0) === 0 && (d.closedPositions ?? 0) === 0 && (d.totalPnl ?? 0) === 0;
  return { usable: !allZero, note: allZero ? "every figure 0" : `notional ${d.activeNotional}, closed ${d.closedPositions}` };
});

// --- 3. The Sui gRPC checkpoint stamp ---------------------------------------------------------------------------------
if (PROBE) {
  const { latestCheckpoint, tatumSuiClient } = await import("../packages/chain/src/suiGrpc.js");
  const tg = Date.now();
  let grpcOk = false, grpcNote = "";
  try { const c = await latestCheckpoint(tatumSuiClient(KEY!)); grpcOk = true; grpcNote = `checkpoint ${c.sequence}`; }
  catch (e) { grpcNote = e instanceof Error ? e.message.slice(0, 50) : String(e); }
  spent += TATUM_CREDITS.grpcQuery;
  calls.push({ label: "Sui gRPC latest checkpoint (the verdict stamp)", path: "grpcQuery", credits: TATUM_CREDITS.grpcQuery, status: grpcOk ? 200 : 0, usable: grpcOk, note: grpcNote, ms: Date.now() - tg });
}

// --- Report ------------------------------------------------------------------------------------------------------------
if (calls.length) {
const w = Math.max(...calls.map((c) => c.label.length));
console.log("CALL".padEnd(w) + "  CREDITS  STATUS  USABLE  DETAIL");
for (const c of calls) {
  console.log(`${c.label.padEnd(w)}  ${String(c.credits).padStart(7)}  ${String(c.status).padStart(6)}  ${(c.usable ? "yes" : "NO").padStart(6)}  ${c.note} (${c.ms} ms)`);
}
console.log(`\nMeasured credits spent by this run: ${spent}`);
}

// --- Per-action cost, from the code paths in apps/web/lib/xray-service.ts ---------------------------------------------
const G = TATUM_CREDITS.grpcQuery, M = TATUM_CREDITS.market, T = TATUM_CREDITS.marketTradesPage;
const actions = [
  ["Wallet X-ray (cold)", G + TATUM_CREDITS.walletValue + TATUM_CREDITS.walletMarketsTraded, "anchor() + wallet value + markets-traded"],
  ["Wallet X-ray (anchor cached, <15 s)", TATUM_CREDITS.walletValue + TATUM_CREDITS.walletMarketsTraded, "wallet pair only"],
  ["Wallet X-ray (wallet cached, <10 min)", G, "anchor only"],
  ["Market X-ray (cold, 3 trade pages)", G + M + 3 * T, "anchor() + market snapshot + preferredFills"],
  ["Market X-ray (cold, trades feed empty)", G + M + T, "one page comes back empty, then it stops"],
  ["Market X-ray (fully cached, <2 min)", G, "anchor only"],
  ["Any other page view (Radar, Record, Proof, Method)", 0, "static JSON from apps/web/data, no Tatum"],
  ["Paid agent API call", G + TATUM_CREDITS.walletValue + TATUM_CREDITS.walletMarketsTraded + G, "X-ray + payment confirmed on chain"],
] as const;
console.log("\n--- Credits per user action (from the real call paths) ---");
const aw = Math.max(...actions.map((a) => a[0].length));
for (const [label, cost, why] of actions) console.log(`${label.padEnd(aw)}  ${String(cost).padStart(5)}  ${why}`);

// --- Watcher cost per hour -------------------------------------------------------------------------------------------
// Measured on the VPS logs: 6 passes an hour, discovery every 2 h (3 event listings), about 1.8 moves judged an hour.
const perMove = TATUM_CREDITS.marketHistory + M + TATUM_CREDITS.marketPrice + T + G;
const watcherHour = (3 * TATUM_CREDITS.events) / 2 + 1.8 * perMove + 1.5 * M;
console.log("\n--- Watcher ---");
console.log(`Per judged move: ${perMove} (history ${TATUM_CREDITS.marketHistory} + market ${M} + price ${TATUM_CREDITS.marketPrice} + 1 trade page ${T} + gRPC ${G})`);
console.log(`Per hour at 1.8 moves/h, discovery every 2 h, 1.5 resolution checks/h: about ${Math.round(watcherHour)}`);
console.log(`Per day: about ${Math.round(watcherHour * 24).toLocaleString()}`);

// --- Projections -----------------------------------------------------------------------------------------------------
const marketXrayCold = G + M + T;   // trades feed is empty today, so one page
const walletXrayCold = G + TATUM_CREDITS.walletValue + TATUM_CREDITS.walletMarketsTraded;
const scenarios = [
  ["Quiet (judges only)", 20, 20],
  ["Mildly busy", 200, 200],
  ["Busy", 1_000, 1_000],
  ["Very busy", 5_000, 5_000],
  ["Front page of HN", 25_000, 25_000],
] as const;
const SITE_DAILY_CAP = Number(process.env.TATUM_DAILY_CREDITS ?? 20_000);
const n = (x: number) => Math.round(x).toLocaleString();
console.log(`\n--- How long ${ALLOWANCE.toLocaleString()} credits last (${DAYS} days to the 17 Nov announcement) ---`);
console.log(`Site X-rays are capped at TATUM_DAILY_CREDITS = ${SITE_DAILY_CAP.toLocaleString()}/day: past that the site serves`);
console.log(`free Polymarket data with a labelled fallback, so demand above the cap costs nothing and cannot drain the plan.\n`);
console.log("SCENARIO".padEnd(22) + "MKT/DAY  WAL/DAY    WANTED/DAY     BILLED/DAY    +WATCHER      TOTAL   VERDICT");
for (const [name, mkt, wal] of scenarios) {
  const wanted = mkt * marketXrayCold + wal * walletXrayCold;
  const billed = Math.min(wanted, SITE_DAILY_CAP);
  const perDay = billed + watcherHour * 24;
  const total = perDay * DAYS;
  const verdict = total <= ALLOWANCE
    ? `fits, ${(ALLOWANCE / total).toFixed(1)}x headroom${wanted > billed ? " (capped)" : ""}`
    : `OVER: lasts ${(ALLOWANCE / perDay).toFixed(1)} days`;
  console.log(`${name.padEnd(22)}${String(mkt).padStart(7)}  ${String(wal).padStart(7)}  ${n(wanted).padStart(12)}  ${n(billed).padStart(13)}  ${n(watcherHour * 24).padStart(10)}  ${n(total).padStart(9)}   ${verdict}`);
}
// --- What the budgets should be set to for this allowance -------------------------------------------------------------
const watcherDay = watcherHour * 24;
const perDayAllowed = ALLOWANCE / DAYS;
const siteDayAllowed = perDayAllowed - watcherDay;
const safeSiteDaily = Math.floor((siteDayAllowed * 0.8) / 1000) * 1000; // 20% held back
console.log(`\n--- Recommended settings for a ${ALLOWANCE.toLocaleString()}-credit allowance over ${DAYS} days ---`);
console.log(`Spendable per day: ${n(perDayAllowed)}. The watcher needs about ${n(watcherDay)}, leaving ${n(siteDayAllowed)} for the site.`);
console.log(`  TATUM_DAILY_CREDITS = ${safeSiteDaily.toLocaleString()}  (site, 20% held back; the default 20,000 is far too low for this allowance)`);
console.log(`  TATUM_CREDIT_BUDGET = ${n(watcherDay * DAYS * 1.2)}  (watcher, the whole period plus 20%)`);
console.log(`At ${safeSiteDaily.toLocaleString()}/day the site serves about ${Math.floor(safeSiteDaily / marketXrayCold)} cold market X-rays or ${Math.floor(safeSiteDaily / walletXrayCold)} cold wallet`);
console.log(`X-rays a day entirely on Tatum before anything falls back to free data.`);

console.log(`\nNote: these are worst cases. Every figure above assumes no cache hit, and the site caches the checkpoint 15 s,`);
console.log(`market snapshots 2 min and wallet snapshots 10 min, so real traffic lands well under this.`);
console.log(`The hard stops in the code: TATUM_DAILY_CREDITS (site, default 20,000/day) and TATUM_CREDIT_BUDGET (watcher, default 95,000).`);
