// Experiment: does a wallet's edge against the price it paid persist from its older trades to its newer ones?
// If it does, weighting market moves by learned wallet skill can carry information; if not, CALIBRE must say so.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { PredictionClient, type Market, type WalletTrade } from "../packages/chain/src/index.js";
import { prefetchResolutions, publicMarketTakers, publicResolution, publicWalletHistory } from "./public-source.js";
import { priceEdge, onePickPerMarket, tradesToPicks, type CategorisedPick, type ResolutionLike } from "../packages/core/src/index.js";
import { need } from "./env.js";

const N_TOP = Number(process.env.N_TOP ?? 25);
const N_RANDOM = Number(process.env.N_RANDOM ?? 25);
const TRADES = Number(process.env.TRADES ?? 200);
const MIN_PICKS = 10;

// SOURCE=public runs the study on Polymarket's free public data plus already-cached Tatum responses,
// spending no Tatum credits. The default uses Tatum's Prediction Markets API.
const PUBLIC = process.env.SOURCE === "public";
const api = new PredictionClient(need("TATUM_API_KEY"), {
  cacheDir: ".cache/tatum", rps: 3, callBudget: Number(process.env.TATUM_CALL_BUDGET ?? 1500), budgetFile: ".cache/tatum-calls.json",
});

/** A Tatum response already on disk, regardless of age (the cache key is the request path). */
async function tatumCached<T>(path: string): Promise<T | null> {
  try { return (JSON.parse(await readFile(`.cache/tatum/${createHash("sha1").update(path).digest("hex")}.json`, "utf8")) as { body: T }).body; }
  catch { return null; }
}

// 1. Wallet samples
const topFromCache = (await tatumCached<{ data: { proxyWallet: string }[] }>("/top-traders?category=SPORTS&limit=50"))
  ?? (await tatumCached<{ data: { proxyWallet: string }[] }>("/top-traders?category=SPORTS&limit=25"));
const top = PUBLIC
  ? (topFromCache?.data ?? []).map((t) => t.proxyWallet).slice(0, N_TOP)
  : (await api.topTraders({ category: "SPORTS", limit: Math.min(50, N_TOP) })).map((t) => t.proxyWallet);
const random = new Set<string>();
const SAMPLE_FILE = ".cache/active-sample.json";
const savedSample = await readFile(SAMPLE_FILE, "utf8").then((s) => JSON.parse(s) as string[]).catch(() => null);
if (N_RANDOM > 0 && process.env.SAMPLE === "active" && savedSample) {
  for (const w of savedSample.slice(0, N_RANDOM)) random.add(w);
} else if (N_RANDOM > 0 && process.env.SAMPLE === "active") {
  // Unbiased by profit: other wallets active in the same sports markets the top wallets traded.
  const markets = new Set<string>();
  for (const w of top) for (const t of await publicWalletHistory(w, 1000)) markets.add(t.conditionId);
  const shuffled = [...markets].sort(() => Math.random() - 0.5).slice(0, 120);
  const seen = new Map<string, number>();
  for (const m of shuffled) for (const w of new Set(await publicMarketTakers(m))) seen.set(w, (seen.get(w) ?? 0) + 1);
  const active = [...seen].filter(([w, n]) => n >= 3 && !top.includes(w)).map(([w]) => w);
  for (const w of active.sort(() => Math.random() - 0.5).slice(0, N_RANDOM)) random.add(w);
  await mkdir(".cache", { recursive: true });
  await writeFile(SAMPLE_FILE, JSON.stringify([...random]));
} else if (N_RANDOM > 0) {
  const closed = await api.events({ platform: "polymarket", status: "closed", category: "SPORTS", sort: "newest", limit: 40 });
  for (const ev of closed.data) {
    if (random.size >= N_RANDOM) break;
    const trades = await api.marketTrades(ev.markets[0]!, { limit: 100 });
    for (const t of trades.data) if (!top.includes(t.taker)) random.add(t.taker);
  }
}
const samples: [string, string[]][] = [["top", top], ["random", [...random].slice(0, N_RANDOM)]];
console.log(`source=${PUBLIC ? "public" : "tatum"} wallets=${top.length}+${random.size} trades<=${TRADES}`);

// 2. Histories and resolutions
const resolutions = new Map<string, ResolutionLike | null>();
async function resolve(ids: string[]) {
  if (PUBLIC) await prefetchResolutions(ids.filter((id) => !resolutions.has(id)));
  for (const id of ids) {
    if (resolutions.has(id)) continue;
    try {
      const hit = PUBLIC ? await tatumCached<{ data: Market }>(`/markets/${id}`) : null;
      if (hit?.data.resolution) {
        resolutions.set(id, { outcome: hit.data.resolution.outcome, outcomes: hit.data.outcomes.map((o) => o.name) });
      } else if (PUBLIC) {
        resolutions.set(id, await publicResolution(id));
      } else {
        const m = await api.market(id);
        resolutions.set(id, m.resolution ? { outcome: m.resolution.outcome, outcomes: m.outcomes.map((o) => o.name) } : null);
      }
    } catch { resolutions.set(id, null); }
  }
}

interface Row { group: string; wallet: string; n: number; bssOld: number; bssNew: number; leagues: string }
const rows: Row[] = [];
let done = 0;
for (const [group, wallets] of samples) {
  for (const w of wallets) {
    let trades: WalletTrade[] = [];
    try { trades = PUBLIC ? await publicWalletHistory(w, TRADES) : await api.walletHistory(w, TRADES); } catch (e) { console.log("skip", w, (e as Error).message.slice(0, 80)); continue; }
    await resolve([...new Set(trades.map((t) => t.conditionId))]);
    const picks: CategorisedPick[] = onePickPerMarket(tradesToPicks(trades, resolutions)).sort((a, b) => a.ts - b.ts);
    done++;
    if (picks.length < MIN_PICKS) { console.log(`[${done}] ${group} ${w.slice(0, 10)} only ${picks.length} resolved picks`); continue; }
    const half = Math.floor(picks.length / 2);
    const old = priceEdge(picks.slice(0, half), { halfLifeDays: Infinity });
    const recent = priceEdge(picks.slice(half), { halfLifeDays: Infinity });
    const leagues = [...new Set(picks.map((p) => p.league))].slice(0, 4).join(",");
    rows.push({ group, wallet: w, n: picks.length, bssOld: old.edge, bssNew: recent.edge, leagues });
    console.log(`[${done}] ${group} ${w.slice(0, 10)} picks=${picks.length} edge old=${old.edge.toFixed(3)} (z ${old.z.toFixed(1)}) new=${recent.edge.toFixed(3)} (z ${recent.z.toFixed(1)}) ${leagues}`);
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
