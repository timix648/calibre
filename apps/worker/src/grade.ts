// M1.3: grade sealed verdicts whose market has resolved, then fold the new evidence back into wallet memories.
//   pnpm --filter @calibre/worker grade [--force]
import { TatumBudgetExceeded } from "../../../packages/chain/src/index.js";
import {
  MODEL_VERSIONS, POLITICS, gradeForecast, needsNewVersion, outcomeRecord, summariseGrades, walletKey, yesWon,
  type OutcomeData, type ResolutionLike, type WalletEdgeRow,
} from "../../../packages/core/src/index.js";
import { encode, NAMESPACES } from "../../../packages/memory/src/index.js";
import { fetchResolutions } from "../../../packages/public-data/src/index";
import { publicWalletHistory } from "../../../scripts/public-source.js";
import {
  OUTCOME_LEDGER_FILE, VERDICT_LEDGER_FILE, WALLET_INDEX_FILE, WORKER_DIR, cliArgs, memoryStore, predictionClient, readJson, tatumCallsUsed, writeJson,
} from "./lib/config.js";
import type { LedgerEntry, OutcomeEntry } from "./lib/ledger.js";
import { loadMemoryState, loadResolutions, politicsRows, sealWalletMemories, walletRows } from "./lib/wallet-index.js";

const FORCE = cliArgs().has("force");
const CHECK_EVERY_MS = 60 * 60_000;
const CHECK_STATE_FILE = `${WORKER_DIR}/grade-state.json`;

const api = predictionClient();
const store = memoryStore();
const verdicts = await readJson<LedgerEntry[]>(VERDICT_LEDGER_FILE, []);
const outcomes = await readJson<OutcomeEntry[]>(OUTCOME_LEDGER_FILE, []);
const checked = await readJson<Record<string, number>>(CHECK_STATE_FILE, {});
const done = new Set(outcomes.map((o) => o.key));
const pending = verdicts.filter((v) => !done.has(v.key) && checked[v.key] !== -1);
console.log(`${verdicts.length} sealed verdicts, ${outcomes.length} graded, ${pending.length} waiting`);

// 1. Which pending verdicts have resolved? Ask Polymarket's free Gamma API first (batched), and spend one Tatum call
// per market only once Gamma says it has resolved; Tatum caches resolved markets forever. This keeps grading off the
// Tatum hourly budget, which used to grow with every sealed verdict.
const fresh: OutcomeData[] = [];
const due = pending.filter((v) => FORCE || Date.now() - (checked[v.key] ?? 0) >= CHECK_EVERY_MS);
const gamma = due.length ? await fetchResolutions(due.map((v) => v.verdict.marketId)).catch(() => new Map()) : new Map();
let tatumOut = false;
for (const v of due) {
  checked[v.key] = Date.now();
  const pub = gamma.get(v.verdict.marketId.toLowerCase()) ?? null;
  if (!pub) { console.log(`  ${v.verdict.eventSlug}: not resolved yet (Gamma)`); continue; }
  let resolution: { outcome: string; outcomes: string[] } = { outcome: pub.outcome, outcomes: pub.outcomes ?? [] };
  if (!tatumOut) {
    try {
      const market = await api.market(v.verdict.marketId);
      if (market.resolution) resolution = { outcome: market.resolution.outcome, outcomes: market.outcomes.map((o) => o.name) };
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) { console.error(`${e.message} Grading from Polymarket public data.`); tatumOut = true; }
      else console.log(`  ${v.verdict.marketId.slice(0, 10)}: Tatum ${(e as Error).message}; using Polymarket public resolution`);
    }
  }
  const market = { resolution: { outcome: resolution.outcome }, outcomes: resolution.outcomes.map((name) => ({ name })) };
  const y = yesWon(market.resolution.outcome, market.outcomes.map((o) => o.name));
  if (y === null) { console.log(`  ${v.verdict.eventSlug}: resolved "${market.resolution.outcome}", not gradable`); checked[v.key] = -1; continue; }
  const d = v.verdict;
  fresh.push({
    verdictKey: v.key, marketId: d.marketId, question: d.question, label: d.label, resolution: market.resolution.outcome,
    yesWon: y, forecast: d.forecast, priceAtVerdict: d.priceAtVerdict, grade: gradeForecast(d.forecast, d.priceAtVerdict, y),
    gradedAt: new Date().toISOString(), model: d.model ?? "v1",
  });
}
await writeJson(CHECK_STATE_FILE, checked);

// 2. Seal one outcome memory per newly graded verdict
if (fresh.length > 0) {
  const records = fresh.map((o) => outcomeRecord(o));
  const stored = await store.rememberBulk(NAMESPACES.outcomes, records.map((r) => encode(r)));
  fresh.forEach((o, i) => {
    const blobId = stored[i]?.blobId;
    if (blobId) outcomes.push({ key: o.verdictKey, blobId, outcome: o });
  });
  await writeJson(OUTCOME_LEDGER_FILE, outcomes);
  console.log(`outcomes sealed: ${stored.filter((s) => s.blobId).length}/${fresh.length}`);
}

// 3. Brier by label: CALIBRE's forecast against the market price right after the move, one table per judging model
// (v1 verdicts predate the conservative forecast and are never pooled with v2; v3 judges like v2 and adds square money).
for (const model of MODEL_VERSIONS) {
  const graded = outcomes.filter((o) => (o.outcome.model ?? "v1") === model);
  if (graded.length === 0) continue;
  console.log(`\nmodel ${model}: label          n   forecast Brier   market Brier   gain      forecast closer`);
  for (const s of summariseGrades(graded.map((o) => ({ label: o.outcome.label, grade: o.outcome.grade })))) {
    console.log(`${s.label.padEnd(12)} ${String(s.n).padStart(3)}   ${s.forecastBrier.toFixed(4).padStart(14)}   ${s.marketBrier.toFixed(4).padStart(12)}   ${s.gain.toFixed(4).padStart(7)}   ${(s.winRate * 100).toFixed(0)}%`);
  }
}

// 4. Learning loop: re-score the wallets behind each newly graded verdict with their newest resolved bets
if (fresh.length > 0) {
  const seen = new Map<string, Set<string>>();
  for (const o of fresh) {
    const v = verdicts.find((x) => x.key === o.verdictKey)!.verdict;
    for (const w of v.topWallets) seen.set(w.wallet, (seen.get(w.wallet) ?? new Set()).add(v.league));
  }
  const index = await readJson<WalletEdgeRow[]>(WALLET_INDEX_FILE, []);
  const state = await loadMemoryState();
  const before = new Map(index.map((r) => [walletKey(r.wallet, r.league), r]));
  const updatedRows: WalletEdgeRow[] = [];
  const resolutions = new Map<string, ResolutionLike | null>();
  for (const wallet of seen.keys()) {
    const trades = await publicWalletHistory(wallet, 1000, { fresh: true });
    await loadResolutions(trades.map((t) => t.conditionId), resolutions, { maxEmptyAgeMs: 3 * 3_600_000 });
    const leagues = seen.get(wallet)!;
    const now = new Date().toISOString();
    if ([...leagues].some((l) => l !== POLITICS)) updatedRows.push(...walletRows(wallet, trades, resolutions, now));
    if (leagues.has(POLITICS)) updatedRows.push(...(await politicsRows(wallet, trades, resolutions, now)));
  }
  const replaced = new Set(updatedRows.map((r) => walletKey(r.wallet, r.league)));
  const merged = [...index.filter((r) => !replaced.has(walletKey(r.wallet, r.league))), ...updatedRows].sort((a, b) => b.z - a.z);
  await writeJson(WALLET_INDEX_FILE, merged);

  const changed = updatedRows.filter((r) => {
    const key = walletKey(r.wallet, r.league);
    return seen.get(r.wallet)?.has(r.league) && needsNewVersion(state[key]?.edge, r.edge) && r.n >= 30;
  });
  for (const r of updatedRows) {
    if (!seen.get(r.wallet)?.has(r.league)) continue;
    const old = before.get(walletKey(r.wallet, r.league));
    console.log(`  ${r.wallet.slice(0, 10)} ${r.league}: edge ${old ? (old.edge * 100).toFixed(1) : "new"} -> ${(r.edge * 100).toFixed(1)} pts, n ${old?.n ?? 0} -> ${r.n}`);
  }
  const written = await sealWalletMemories(store, changed);
  console.log(`wallet memories re-versioned: ${written}`);
}

const { used, budget } = await tatumCallsUsed();
console.log(`Tatum calls used: ${used}/${budget}`);
process.exit(0);
