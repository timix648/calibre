// Experiment: does a wallet's skill against the price it paid persist from its older trades to its newer ones?
// If it does, weighting market moves by learned wallet skill can carry information; if not, CALIBRE must say so.
import { mkdir, writeFile } from "node:fs/promises";
import { PredictionClient, type WalletTrade } from "../packages/chain/src/index.js";
import { brierSkill, onePickPerMarket, tradesToPicks, type CategorisedPick, type ResolutionLike } from "../packages/core/src/index.js";
import { need } from "./env.js";

const N_TOP = Number(process.env.N_TOP ?? 25);
const N_RANDOM = Number(process.env.N_RANDOM ?? 25);
const TRADES = Number(process.env.TRADES ?? 200);
const MIN_PICKS = 10;

const api = new PredictionClient(need("TATUM_API_KEY"), { cacheDir: ".cache/tatum", rps: 3 });

// 1. Wallet samples
const top = (await api.topTraders({ category: "SPORTS", limit: Math.min(50, N_TOP) })).map((t) => t.proxyWallet);
const random = new Set<string>();
const closed = await api.events({ platform: "polymarket", status: "closed", category: "SPORTS", sort: "newest", limit: 40 });
for (const ev of closed.data) {
  if (random.size >= N_RANDOM) break;
  const trades = await api.marketTrades(ev.markets[0]!, { limit: 100 });
  for (const t of trades.data) if (!top.includes(t.taker)) random.add(t.taker);
}
const samples: [string, string[]][] = [["top", top], ["random", [...random].slice(0, N_RANDOM)]];

// 2. Histories and resolutions
const resolutions = new Map<string, ResolutionLike | null>();
async function resolve(ids: string[]) {
  for (const id of ids) {
    if (resolutions.has(id)) continue;
    try {
      const m = await api.market(id);
      resolutions.set(id, m.resolution ? { outcome: m.resolution.outcome, outcomes: m.outcomes.map((o) => o.name) } : null);
    } catch { resolutions.set(id, null); }
  }
}

interface Row { group: string; wallet: string; n: number; bssOld: number; bssNew: number; leagues: string }
const rows: Row[] = [];
let done = 0;
for (const [group, wallets] of samples) {
  for (const w of wallets) {
    let trades: WalletTrade[] = [];
    try { trades = await api.walletHistory(w, TRADES); } catch (e) { console.log("skip", w, (e as Error).message.slice(0, 80)); continue; }
    await resolve([...new Set(trades.map((t) => t.conditionId))]);
    const picks: CategorisedPick[] = onePickPerMarket(tradesToPicks(trades, resolutions)).sort((a, b) => a.ts - b.ts);
    done++;
    if (picks.length < MIN_PICKS) { console.log(`[${done}] ${group} ${w.slice(0, 10)} only ${picks.length} resolved picks`); continue; }
    const half = Math.floor(picks.length / 2);
    const old = brierSkill(picks.slice(0, half), { halfLifeDays: Infinity });
    const recent = brierSkill(picks.slice(half), { halfLifeDays: Infinity });
    const leagues = [...new Set(picks.map((p) => p.league))].slice(0, 4).join(",");
    rows.push({ group, wallet: w, n: picks.length, bssOld: old.bss, bssNew: recent.bss, leagues });
    console.log(`[${done}] ${group} ${w.slice(0, 10)} picks=${picks.length} skill old=${old.bss.toFixed(3)} new=${recent.bss.toFixed(3)} ${leagues}`);
  }
}

// 3. Persistence statistics
function rank(xs: number[]) { const s = [...xs].map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = Array(xs.length); s.forEach(([, i], k) => (r[i] = k)); return r as number[]; }
function pearson(a: number[], b: number[]) {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i]! - ma) * (b[i]! - mb); da += (a[i]! - ma) ** 2; db += (b[i]! - mb) ** 2; }
  return num / Math.sqrt(da * db);
}
const summary: Record<string, unknown> = {};
for (const g of ["top", "random", "all"]) {
  const r = rows.filter((x) => g === "all" || x.group === g);
  if (r.length < 4) continue;
  const spearman = pearson(rank(r.map((x) => x.bssOld)), rank(r.map((x) => x.bssNew)));
  const sorted = [...r].sort((a, b) => b.bssOld - a.bssOld), third = Math.max(1, Math.floor(r.length / 3));
  const mean = (xs: Row[]) => xs.reduce((s, x) => s + x.bssNew, 0) / xs.length;
  summary[g] = {
    wallets: r.length, spearman_old_vs_new: +spearman.toFixed(3),
    newSkill_topThirdByOld: +mean(sorted.slice(0, third)).toFixed(4),
    newSkill_bottomThirdByOld: +mean(sorted.slice(-third)).toFixed(4),
    share_positive_new: +(r.filter((x) => x.bssNew > 0).length / r.length).toFixed(2),
  };
}
console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
await mkdir(".cache/results", { recursive: true });
await writeFile(".cache/results/skill-persistence.json", JSON.stringify({ at: new Date().toISOString(), params: { N_TOP, N_RANDOM, TRADES }, summary, rows }, null, 2));
