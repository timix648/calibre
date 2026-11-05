// Checks that the Tatum key in .env works for everything CALIBRE uses, and what it costs (about 500 credits):
//   pnpm exec tsx scripts/tatum-health.ts
// Sui gRPC checkpoint (2), sports events (100), price history for the busiest market (200), its trades (100), and a wallet's value
// and markets-traded count (50 + 50). Prints status, row counts and timings only, never the key or the data itself.
import "./env.js";
import { TATUM_CREDITS, latestCheckpoint, tatumSuiClient } from "../packages/chain/src/index.js";

const KEY = process.env.TATUM_API_KEY ?? "";
if (!KEY) throw new Error("TATUM_API_KEY is not set in .env");
const API = "https://api.tatum.io/v4/data/prediction";
const WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";
let credits = 0;

async function get(path: string, cost: number): Promise<{ status: number; body: any; ms: number }> {
  const t = Date.now();
  const res = await fetch(`${API}${path}`, { headers: { "x-api-key": KEY } });
  const body = await res.json().catch(() => null);
  if (res.ok) credits += cost;
  return { status: res.status, body, ms: Date.now() - t };
}
const line = (name: string, ok: boolean, detail: string) => console.log(`${ok ? "OK  " : "FAIL"} ${name.padEnd(28)} ${detail}`);

const t0 = Date.now();
try {
  const c = await latestCheckpoint(tatumSuiClient(KEY));
  credits += TATUM_CREDITS.grpcQuery;
  line("Sui gRPC checkpoint", true, `${c.sequence} at ${c.timestamp} (${Date.now() - t0} ms)`);
} catch (e) {
  line("Sui gRPC checkpoint", false, (e as Error).message);
}

const ev = await get("/events?platform=polymarket&status=active&category=SPORTS&sort=volume_desc&limit=5", TATUM_CREDITS.events);
const events = (ev.body?.data ?? []) as { title?: string; totalVolume?: number; markets?: string[] }[];
line("Prediction: events", ev.status === 200 && events.length > 0, `HTTP ${ev.status}, ${events.length} events (${ev.ms} ms)`);

// Events list their market ids; take the first market of the busiest event.
const top = [...events].sort((a, b) => (b.totalVolume ?? 0) - (a.totalVolume ?? 0))[0];
const market = top?.markets?.[0] ? { id: top.markets[0], question: top.title } : null;
if (market?.id) {
  const end = new Date();
  const start = new Date(end.getTime() - 2 * 3_600_000);
  const h = await get(`/markets/${market.id}/history?interval=5m&start=${start.toISOString()}&end=${end.toISOString()}`, TATUM_CREDITS.marketHistory);
  const candles = (h.body?.data ?? h.body ?? []) as unknown[];
  line("Prediction: price history", h.status === 200 && Array.isArray(candles) && candles.length > 0, `HTTP ${h.status}, ${Array.isArray(candles) ? candles.length : "?"} candles for "${market.question?.slice(0, 40)}" (${h.ms} ms)`);
  const tr = await get(`/markets/${market.id}/trades?limit=100`, TATUM_CREDITS.marketTradesPage);
  const trades = (tr.body?.data ?? []) as unknown[];
  line("Prediction: trades", tr.status === 200 && trades.length > 0, `HTTP ${tr.status}, ${trades.length} trades (${tr.ms} ms)`);
} else {
  line("Prediction: price history", false, "no market found in the events");
}

const v = await get(`/wallets/${WALLET}/value`, TATUM_CREDITS.walletValue);
line("Prediction: wallet value", v.status === 200 && typeof v.body?.data?.value === "number", `HTTP ${v.status}, value ${v.body?.data?.value ?? "n/a"} (${v.ms} ms)`);
const mt = await get(`/wallets/${WALLET}/markets-traded`, TATUM_CREDITS.walletMarketsTraded);
line("Prediction: markets traded", mt.status === 200 && typeof mt.body?.data?.traded === "number", `HTTP ${mt.status}, traded ${mt.body?.data?.traded ?? "n/a"} (${mt.ms} ms)`);

console.log(`\nCredits spent by this check (at Tatum's listed prices): about ${credits}`);
process.exit(0);
