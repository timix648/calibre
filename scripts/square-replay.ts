// Replay study: do price moves pushed by wallets with a losing record reverse more often than other moves?
//
// For each closed sports market: rebuild the 5-minute YES price from its public fills, find sharp moves, take the
// biggest takers pushing each move, and judge each taker ONLY on bets that had already resolved before the move
// started (no look-ahead). Then measure what happened after the move: price 3 hours later, and the final result.
// Free data only (Polymarket Data API v2 + Gamma), resumable: results append to a JSONL file.
//
// Usage: SAMPLE_FILE=.cache/wide-sample.json pnpm exec tsx scripts/square-replay.ts            (run / resume)
//        pnpm exec tsx scripts/square-replay.ts --report                                       (report from JSONL)
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  classifySlug, onePickPerMarket, priceEdge, publicTradesToFlows, shrunkEdge, tradesToPicks, tradeView,
  priceSeriesFromTrades, type ResolutionLike, type TimedFlowTrade,
} from "../packages/core/src/index.js";
import { prefetchResolutions, publicMarketTradesAll, publicResolution, publicWalletHistory } from "./public-source.js";

const MARKETS_N = Number(process.env.MARKETS_N ?? 1500);
const MIN_JUMP = Number(process.env.MIN_JUMP ?? 0.06);
const WINDOW_MS = Number(process.env.WINDOW_MIN ?? 60) * 60_000;
const HORIZON_MS = Number(process.env.HORIZON_MIN ?? 180) * 60_000;
const TOP_TAKERS = Number(process.env.TOP_TAKERS ?? 6);
const MAX_HOURS = Number(process.env.MAX_HOURS ?? 8);
const SAMPLE_FILE = process.env.SAMPLE_FILE ?? ".cache/wide-sample.json";
const OUT_JSONL = ".cache/results/square-replay.jsonl";
const OUT_REPORT = ".cache/results/SQUARE_REPORT.md";
const SQUARE_Z = -1.5;      // a wallet counts as "proven losing" with z <= -1.5 over at least 30 prior resolved bets
const MIN_PRIOR = 30;

interface WalletRecord { n: number; edge: number; z: number; shrunk: number }
interface MoveRow {
  market: string; slug: string; league: string; phase: "pregame" | "inplay" | "unknown";
  startTs: number; endTs: number; pFrom: number; pTo: number; dir: 1 | -1;
  alignedUsd: number; labeledUsd: number; squareUsd: number; squareShare: number; flowQuality: number | null;
  takers: { wallet: string; usd: number; n: number; edge: number; z: number }[];
  continuation: number | null;   // move-direction price change from move end to +HORIZON (probability points)
  followEdge: number;            // final result minus price at move end, in the move's direction
}

const t0 = Date.now();
const timeUp = () => Date.now() - t0 > MAX_HOURS * 3_600_000;

// ---------- wallet records judged only on information available before a given time ----------
const walletTrades = new Map<string, Awaited<ReturnType<typeof publicWalletHistory>>>();
const resolutions = new Map<string, ResolutionLike | null>();

async function resolveAll(ids: string[]): Promise<void> {
  const missing = [...new Set(ids)].filter((id) => !resolutions.has(id));
  if (missing.length === 0) return;
  await prefetchResolutions(missing);
  for (const id of missing) resolutions.set(id, await publicResolution(id).catch(() => null));
}

async function recordBefore(wallet: string, beforeMs: number): Promise<WalletRecord | null> {
  let trades = walletTrades.get(wallet);
  if (!trades) {
    trades = await publicWalletHistory(wallet, 1000).catch(() => []);
    walletTrades.set(wallet, trades);
  }
  const prior = trades.filter((t) => t.timestamp * 1000 < beforeMs);
  if (prior.length === 0) return null;
  await resolveAll(prior.map((t) => t.conditionId));
  // Only markets that had already closed before the move: their outcome was knowable at that time.
  const known = new Map<string, ResolutionLike | null>();
  for (const t of prior) {
    const r = resolutions.get(t.conditionId);
    if (r && r.closeTs !== undefined && r.closeTs < beforeMs) known.set(t.conditionId, r);
  }
  const picks = onePickPerMarket(tradesToPicks(prior, known, 0.25, undefined, "all"));
  if (picks.length === 0) return null;
  const e = priceEdge(picks, { now: beforeMs });
  return { n: picks.length, edge: e.edge, z: e.z, shrunk: shrunkEdge(e) };
}

// ---------- moves ----------
function findMoves(points: { ts: number; close: number }[]): { i0: number; i1: number }[] {
  const out: { i0: number; i1: number }[] = [];
  let i = 1;
  while (i < points.length && out.length < 3) {
    let best: { i0: number; jump: number } | null = null;
    for (let j = i - 1; j >= 0 && points[i]!.ts - points[j]!.ts <= WINDOW_MS; j--) {
      const from = points[j]!.close;
      if (from < 0.08 || from > 0.92) continue;
      const jump = points[i]!.close - from;
      if (Math.abs(jump) >= MIN_JUMP && (!best || Math.abs(jump) > Math.abs(best.jump))) best = { i0: j, jump };
    }
    if (best) {
      out.push({ i0: best.i0, i1: i });
      const skipUntil = points[i]!.ts + WINDOW_MS;
      while (i < points.length && points[i]!.ts < skipUntil) i++;
    } else i++;
  }
  return out;
}

async function analyseMarket(id: string, slug: string): Promise<MoveRow[]> {
  const res = resolutions.get(id) ?? (await publicResolution(id).catch(() => null));
  if (!res || !res.outcomes || res.outcomes.length !== 2) return [];
  const yesWon = res.outcome.trim().toLowerCase() === res.outcomes[0]!.trim().toLowerCase() ? 1 : 0;
  const fills = publicTradesToFlows(await publicMarketTradesAll(id)).sort((a, b) => a.ts - b.ts);
  if (fills.length < 40) return [];
  const points = priceSeriesFromTrades(fills);
  const rows: MoveRow[] = [];
  for (const { i0, i1 } of findMoves(points)) {
    const a = points[i0]!, b = points[i1]!;
    const dir = (b.close > a.close ? 1 : -1) as 1 | -1;
    const window = fills.filter((f) => f.ts >= a.ts && f.ts <= b.ts + 5 * 60_000);
    const byTaker = new Map<string, number>();
    for (const f of window) {
      const v = tradeView(f);
      if (Math.sign(v.yesUsd) === dir) byTaker.set(f.taker, (byTaker.get(f.taker) ?? 0) + Math.abs(v.yesUsd));
    }
    const alignedUsd = [...byTaker.values()].reduce((s, x) => s + x, 0);
    const top = [...byTaker].sort((x, y) => y[1] - x[1]).slice(0, TOP_TAKERS);
    const takers: MoveRow["takers"] = [];
    let labeledUsd = 0, squareUsd = 0, qualityAcc = 0;
    for (const [wallet, usd] of top) {
      const rec = await recordBefore(wallet, a.ts);
      if (!rec || rec.n < MIN_PRIOR) continue;
      takers.push({ wallet, usd, n: rec.n, edge: rec.edge, z: rec.z });
      labeledUsd += usd;
      qualityAcc += usd * rec.shrunk;
      if (rec.z <= SQUARE_Z) squareUsd += usd;
    }
    const later = points.find((p) => p.ts >= b.ts + HORIZON_MS);
    const closeTs = res.closeTs ?? Infinity;
    const continuation = later && later.ts < closeTs ? dir * (later.close - b.close) : null;
    const followEdge = dir === 1 ? yesWon - b.close : b.close - yesWon;
    const phase = res.startTs === undefined ? "unknown" : a.ts >= res.startTs ? "inplay" : "pregame";
    rows.push({
      market: id, slug, league: classifySlug(slug).league, phase, startTs: a.ts, endTs: b.ts, pFrom: a.close, pTo: b.close, dir,
      alignedUsd, labeledUsd, squareUsd, squareShare: labeledUsd > 0 ? squareUsd / labeledUsd : 0,
      flowQuality: labeledUsd > 0 ? qualityAcc / labeledUsd : null, takers, continuation, followEdge,
    });
  }
  return rows;
}

// ---------- report ----------
const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
function bootCI(xs: number[], reps = 4000): [number, number] {
  const ms: number[] = [];
  for (let r = 0; r < reps; r++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(Math.random() * xs.length)]!; ms.push(s / xs.length); }
  ms.sort((a, b) => a - b);
  return [ms[Math.floor(reps * 0.025)]!, ms[Math.floor(reps * 0.975)]!];
}
function diffP(a: number[], b: number[], reps = 5000): number {
  // One-sided permutation p-value that mean(a) < mean(b).
  const obs = mean(a) - mean(b), all = [...a, ...b];
  let hits = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [all[i], all[j]] = [all[j]!, all[i]!]; }
    if (mean(all.slice(0, a.length)) - mean(all.slice(a.length)) <= obs) hits++;
  }
  return hits / reps;
}
const pts = (x: number) => (x * 100).toFixed(1);

function groupLine(label: string, rows: MoveRow[]): string {
  if (rows.length < 10) return `| ${label} | ${rows.length} | (too few) | | |`;
  const f = rows.map((r) => r.followEdge), c = rows.map((r) => r.continuation).filter((x): x is number => x !== null);
  const [lo, hi] = bootCI(f);
  return `| ${label} | ${rows.length} | ${pts(mean(f))} [${pts(lo)}, ${pts(hi)}] | ${c.length ? `${pts(mean(c))} (n ${c.length})` : "-"} |`;
}

async function report(): Promise<void> {
  const rows: MoveRow[] = (await readFile(OUT_JSONL, "utf8").catch(() => "")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // A move counts only when the takers we could judge carried at least 20% of the money pushing it.
  const labeled = rows.filter((r) => r.labeledUsd > 0 && r.labeledUsd >= 0.2 * r.alignedUsd);
  const square = labeled.filter((r) => r.squareShare >= 0.5);
  const clean = labeled.filter((r) => r.squareShare === 0);
  const mixed = labeled.filter((r) => r.squareShare > 0 && r.squareShare < 0.5);
  const lines = [
    "# Square-money replay", "",
    `Generated ${new Date().toISOString()}. Moves >= ${MIN_JUMP * 100} pts within ${WINDOW_MS / 60_000} min; continuation measured ${HORIZON_MS / 60_000} min after the move.`,
    `Markets analysed: ${new Set(rows.map((r) => r.market)).size}. Moves: ${rows.length}. Moves with labeled takers (>= ${MIN_PRIOR} prior resolved bets): ${labeled.length}.`,
    "", "**Follow edge** = final result minus the price at the end of the move, in the move's direction (positive: following the move paid; negative: the move overshot).",
    "**Continuation** = price change in the move's direction over the next few hours.", "",
    "| Moves pushed by | Moves | Follow edge, pts [95% CI] | Continuation, pts |", "|---|---|---|---|",
    groupLine("proven losers (>= 50% of labeled flow)", square),
    groupLine("mixed", mixed),
    groupLine("no proven losers", clean),
    groupLine("all labeled moves", labeled),
    "",
  ];
  if (square.length >= 10 && clean.length >= 10) {
    lines.push(`Difference in follow edge, loser-driven minus clean: **${pts(mean(square.map((r) => r.followEdge)) - mean(clean.map((r) => r.followEdge)))} pts**, ` +
      `one-sided permutation p = ${diffP(square.map((r) => r.followEdge), clean.map((r) => r.followEdge)).toFixed(4)}.`, "");
  }
  for (const phase of ["pregame", "inplay"] as const) {
    const sq = square.filter((r) => r.phase === phase), cl = clean.filter((r) => r.phase === phase);
    lines.push(`- ${phase}: loser-driven ${sq.length} moves, follow edge ${sq.length ? pts(mean(sq.map((r) => r.followEdge))) : "-"} pts; clean ${cl.length} moves, ${cl.length ? pts(mean(cl.map((r) => r.followEdge))) : "-"} pts.`);
  }
  await writeFile(OUT_REPORT, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

// ---------- main ----------
if (process.argv.includes("--report")) { await report(); process.exit(0); }

await mkdir(".cache/results", { recursive: true });
const done = new Set((await readFile(OUT_JSONL, "utf8").catch(() => "")).split("\n").filter(Boolean).map((l) => (JSON.parse(l) as MoveRow).market));
const doneMarketsFile = ".cache/results/square-replay-done.json";
const doneMarkets = new Set<string>(await readFile(doneMarketsFile, "utf8").then((s) => JSON.parse(s) as string[]).catch(() => [...done]));

// Universe: sports game markets traded by the profit-blind sample (their histories are already cached by the wide study).
const sample = JSON.parse(await readFile(SAMPLE_FILE, "utf8")) as string[];
const universe = new Map<string, string>();
for (const w of sample) {
  for (const t of await publicWalletHistory(w, 1000).catch(() => [])) {
    const { league, marketType } = classifySlug(t.slug);
    if (league !== "other" && (marketType === "moneyline" || marketType === "spread" || marketType === "total")) universe.set(t.conditionId, t.slug);
  }
}
const ids = [...universe.keys()].sort(() => Math.random() - 0.5).slice(0, MARKETS_N);
console.log(`universe ${universe.size} sports markets; analysing ${ids.length} (${doneMarkets.size} already done)`);
await resolveAll(ids);

let i = 0, moves = 0;
for (const id of ids) {
  i++;
  if (doneMarkets.has(id)) continue;
  if (timeUp()) { console.log(`time limit reached after ${i} markets`); break; }
  try {
    const rows = await analyseMarket(id, universe.get(id)!);
    for (const r of rows) await appendFile(OUT_JSONL, JSON.stringify(r) + "\n");
    moves += rows.length;
  } catch (e) { console.log(`  ${id.slice(0, 10)}: ${(e as Error).message}`); }
  doneMarkets.add(id);
  if (i % 10 === 0) {
    await writeFile(doneMarketsFile, JSON.stringify([...doneMarkets]));
    console.log(`${new Date().toISOString()} markets ${i}/${ids.length}, new moves ${moves}, wallets cached ${walletTrades.size}`);
  }
  if (i % 100 === 0) await report();
}
await writeFile(doneMarketsFile, JSON.stringify([...doneMarkets]));
await report();
await writeFile(".cache/results/SQUARE_DONE", new Date().toISOString());
