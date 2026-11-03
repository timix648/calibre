// M1.2: watch live sports and midterm-election markets, judge price moves by who traded them, and seal each verdict.
//   pnpm --filter @calibre/worker watch [--min-jump 0.05] [--max-markets 16] [--max-politics 14] [--loop 10] [--dry]
//                                       [--segment sports|politics|all] [--tatum-hourly 50] [--discover-every 60]
//
// Tatum is the primary source. When its history or trades come back empty (or fail) for an active market, the same data
// is read from Polymarket's free public API and every verdict says so (`source`, `fallbackReason`). A market whose Tatum
// history came back empty is not asked again for 60 minutes, so a broken endpoint does not burn credits.
import {
  PredictionApiError, TatumBudgetExceeded, latestCheckpoint, type Market, type PredictionClient,
} from "../../../packages/chain/src/index.js";
import {
  BREAKER_HOLD_MS, MODEL_VERSION, aggregateFlows, breakerOpen, callsInLastHour, candlePoints, judgeMove, latestMove, priceSeriesFromTrades,
  publicTradesToFlows, selectCandidates, selectMidtermCandidates, tripBreaker, verdictKey, verdictRecord, walletKey,
  type BreakerState, type Candidate, type DataSource, type FlowTrade, type Move, type TimedFlowTrade, type VerdictData,
  type VerdictWallet, type WalletEdgeRow,
} from "../../../packages/core/src/index.js";
import { encode, NAMESPACES, type MemoryStore } from "../../../packages/memory/src/index.js";
import { publicMarketTradesSince } from "../../../scripts/public-source.js";
import {
  BREAKER_FILE, TATUM_LOG_FILE, VERDICT_LEDGER_FILE, WATCH_STATE_FILE, cliArgs, memoryStore, predictionClient, readJson, sleep,
  suiClient, tatumCallsUsed, writeJson,
} from "./lib/config.js";
import { activeEvents } from "./lib/events.js";
import type { LedgerEntry } from "./lib/ledger.js";
import { loadIndex, loadMemoryState, skillLookup } from "./lib/wallet-index.js";

const REJUDGE_AFTER_MS = 2 * 3_600_000;
const HISTORY_WINDOW_MS = 2 * 3_600_000;
const FIVE_MIN_MS = 5 * 60_000;
/** The newest price point must be this recent, otherwise the market is idle or finished and a "move" would be old news. */
const FRESH_CANDLE_MS = 25 * 60_000;
/** Tatum calls kept free for judging (live price, market, trades) when the hourly cap is reached. */
const JUDGING_RESERVE = 10;

const args = cliArgs();
const MIN_JUMP = Number(args.get("min-jump") ?? 0.05);
const MAX_MARKETS = Number(args.get("max-markets") ?? 16);
const MAX_POLITICS = Number(args.get("max-politics") ?? 14);
const SEGMENT = args.get("segment") ?? "all";
const HOURLY_CAP = Number(args.get("tatum-hourly") ?? 50);
const DISCOVER_EVERY_MS = Number(args.get("discover-every") ?? 60) * 60_000;
const LOOP_MINUTES = args.has("loop") ? Number(args.get("loop") === "true" ? 10 : args.get("loop")) : 0;
const DRY = args.has("dry");

type WatchState = Record<string, number>;

/** Where one market's evidence came from. */
interface Evidence {
  source: DataSource;
  fallbackReason?: string;
  /** Public fills of the last two hours, newest first, when they were already fetched for the price series. */
  fills?: TimedFlowTrade[];
}

const api: PredictionClient = predictionClient({ maxRetries: 1 });
let breaker: BreakerState = await readJson<BreakerState>(BREAKER_FILE, {});
let tatumLog: number[] = await readJson<number[]>(TATUM_LOG_FILE, []);

/** Run a Tatum operation and record the credits it spent, so the hourly cap sees every call. */
async function metered<T>(run: () => Promise<T>): Promise<T> {
  const before = (await tatumCallsUsed()).used;
  try { return await run(); }
  finally {
    const spent = (await tatumCallsUsed()).used - before;
    const now = Date.now();
    tatumLog = [...tatumLog.filter((t) => now - t < 3_600_000), ...Array<number>(Math.max(0, spent)).fill(now)];
    await writeJson(TATUM_LOG_FILE, tatumLog);
  }
}

const tatumRoom = (reserve = JUDGING_RESERVE) => callsInLastHour(tatumLog, Date.now()) < HOURLY_CAP - reserve;

async function trip(marketId: string): Promise<void> {
  breaker = tripBreaker(breaker, marketId, Date.now(), BREAKER_HOLD_MS);
  await writeJson(BREAKER_FILE, breaker);
}

const describe = (e: unknown) => e instanceof PredictionApiError ? `HTTP ${e.status}` : (e as Error).message;

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16) + " UTC";

async function discover(now: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  if (SEGMENT !== "politics") {
    const events = [];
    for (const sort of ["volume_desc", "liquidity_desc"] as const) events.push(...await metered(() => activeEvents(api, "SPORTS", sort, DISCOVER_EVERY_MS)));
    out.push(...selectCandidates(events, { now, maxMarkets: MAX_MARKETS }));
  }
  if (SEGMENT !== "sports") {
    const events = await metered(() => activeEvents(api, "POLITICS", "volume_desc", DISCOVER_EVERY_MS));
    out.push(...selectMidtermCandidates(events, { now, maxMarkets: MAX_POLITICS }));
  }
  return out;
}

/**
 * Price points of a market over the last two hours. Tatum first; when it is empty for an active market, failing, paused
 * by the breaker or out of its hourly allowance, the points come from Polymarket's public fills (5-minute closes).
 */
async function priceSeries(c: Candidate, end: number, now: number): Promise<{ points: ReturnType<typeof candlePoints>; evidence: Evidence }> {
  let reason: string;
  if (breakerOpen(breaker, c.marketId, now)) reason = `Tatum history was empty for this market; not asked again until ${clock(breaker[c.marketId]!)}`;
  else if (!tatumRoom()) reason = `Tatum hourly call cap (${HOURLY_CAP}) reached`;
  else {
    try {
      const candles = await metered(() => api.marketHistory(c.marketId, {
        interval: "5m", start: new Date(end - HISTORY_WINDOW_MS).toISOString(), end: new Date(end).toISOString(),
      }));
      if (candles.length > 0) return { points: candlePoints(candles), evidence: { source: "tatum" } };
      await trip(c.marketId);
      reason = "Tatum history returned no candles for an active market";
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      await trip(c.marketId);
      reason = `Tatum history failed (${describe(e)})`;
    }
  }
  const fills = publicTradesToFlows(await publicMarketTradesSince(c.marketId, end - HISTORY_WINDOW_MS, 4));
  return { points: priceSeriesFromTrades(fills), evidence: { source: "polymarket-public", fallbackReason: reason, fills } };
}

async function scan(store: MemoryStore): Promise<number> {
  const now = Date.now();
  const index = await loadIndex();
  const memoryState = await loadMemoryState();
  const judged = await readJson<WatchState>(WATCH_STATE_FILE, {});

  const candidates = await discover(now);
  const politics = candidates.filter((c) => c.league === "politics").length;
  console.log(`${candidates.length} markets to check (${candidates.length - politics} sports, ${politics} midterms; min jump ${MIN_JUMP * 100} pts)`);

  let sealed = 0, active = 0, fromTatum = 0, fromPublic = 0;
  // Candles are requested on 5-minute boundaries so that repeated runs share cached responses.
  const end = Math.ceil(now / FIVE_MIN_MS) * FIVE_MIN_MS;
  for (const c of candidates) {
    if (now - (judged[c.marketId] ?? 0) < REJUDGE_AFTER_MS) { console.log(`  skip ${c.slug} (judged < 2h ago)`); continue; }
    let series;
    try { series = await priceSeries(c, end, now); }
    catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      console.log(`  no data for ${c.slug}: ${describe(e)}`);
      continue;
    }
    const { points, evidence } = series;
    if (evidence.source === "tatum") fromTatum++; else fromPublic++;
    const last = points.at(-1);
    if (!last || now - last.ts > FRESH_CANDLE_MS) continue;
    active++;
    const move = latestMove(points, { minJump: MIN_JUMP, windowMs: 60 * 60_000 });
    if (!move) continue;
    console.log(`  MOVE ${c.slug} ${c.marketId.slice(0, 10)}: ${(move.from * 100).toFixed(0)}% -> ${(move.to * 100).toFixed(0)}% [${evidence.source}]`);
    try {
      if (await judgeAndSeal(store, c, move, evidence, index, memoryState)) { sealed++; judged[c.marketId] = Date.now(); await writeJson(WATCH_STATE_FILE, judged); }
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      console.log(`  could not judge ${c.slug}: ${describe(e)}`);
    }
  }
  console.log(`${active} of ${candidates.length} markets traded in the last ${FRESH_CANDLE_MS / 60_000} minutes (price history: ${fromTatum} from Tatum, ${fromPublic} from Polymarket public)`);
  return sealed;
}

/** Fills behind the move: Tatum's if it has them, otherwise Polymarket's public ones. */
async function fillsFor(c: Candidate, move: Move, evidence: Evidence): Promise<{ fills: FlowTrade[]; evidence: Evidence }> {
  const since = move.startTs - FIVE_MIN_MS;
  if (evidence.source === "tatum") {
    let reason: string;
    try {
      const trades = await metered(() => api.marketTradesSince(c.marketId, since, 5));
      if (trades.length > 0) {
        return { fills: trades.map((t) => ({ taker: t.taker.toLowerCase(), side: t.side, direction: t.direction, price: t.price, size: t.size })), evidence };
      }
      reason = "Tatum trades returned no fills for a market that just moved";
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      reason = `Tatum trades failed (${describe(e)})`;
    }
    await trip(c.marketId);
    evidence = { source: "polymarket-public", fallbackReason: reason };
  }
  const all = evidence.fills ?? publicTradesToFlows(await publicMarketTradesSince(c.marketId, since, 5));
  return { fills: all.filter((t) => t.ts >= since), evidence };
}

async function judgeAndSeal(
  store: MemoryStore, c: Candidate, original: Move, evidenceIn: Evidence,
  index: WalletEdgeRow[], memoryState: Awaited<ReturnType<typeof loadMemoryState>>,
): Promise<boolean> {
  const market: Market = await metered(() => api.market(c.marketId));
  if (market.status !== "active" || market.resolution) { console.log("    market is no longer active, skipped"); return false; }
  const yesOutcome = market.outcomes[0]?.name ?? "YES";

  // The live price always comes from Tatum, whichever source found the move: the verdict is judged against it.
  const live = await metered(() => api.marketPrice(c.marketId));
  if (live.midPrice <= 0.03 || live.midPrice >= 0.97) {
    console.log(`    live Tatum mid ${(live.midPrice * 100).toFixed(1)}% is at an extreme: the market is settling, not moving, skipped`);
    return false;
  }
  const dir = Math.sign(original.to - original.from);
  if ((live.midPrice - original.from) * dir < MIN_JUMP) {
    console.log(`    live Tatum mid ${(live.midPrice * 100).toFixed(1)}% has retraced the move, skipped`);
    return false;
  }
  const move: Move = { ...original, to: live.midPrice };

  const { fills, evidence } = await fillsFor(c, move, evidenceIn);
  const skill = skillLookup(index, c.league);
  const flows = aggregateFlows(fills, skill);
  if (flows.length === 0) { console.log("    no usable trades behind the move, skipped"); return false; }
  const verdict = judgeMove(move.from, move.to, flows);

  const byWallet = new Map(index.filter((r) => r.league === c.league).map((r) => [r.wallet, r]));
  const topWallets: VerdictWallet[] = [...flows]
    .sort((a, b) => Math.abs(b.netYesUsd) - Math.abs(a.netYesUsd))
    .slice(0, 5)
    .map((f) => {
      const row = byWallet.get(f.wallet);
      return {
        wallet: f.wallet, league: c.league, netYesUsd: Math.round(f.netYesUsd * 100) / 100, edge: f.edge,
        z: row ? row.z : null, n: row ? row.n : null, blobId: memoryState[walletKey(f.wallet, c.league)]?.blobId ?? null,
      };
    });

  const checkpoint = await latestCheckpoint(suiClient());
  const data: VerdictData = {
    marketId: c.marketId, eventSlug: c.slug, league: c.league, question: market.question, yesOutcome,
    move, label: verdict.label, sharpShare: verdict.sharpShare,
    opposition: Number.isFinite(verdict.opposition) ? verdict.opposition : null,
    forecast: verdict.forecast, priceAtVerdict: move.to, trades: fills.length, wallets: flows.length, topWallets,
    checkpoint: { sequence: checkpoint.sequence, digest: checkpoint.digest, timestamp: checkpoint.timestamp },
    sealedAt: new Date().toISOString(),
    model: MODEL_VERSION,
    source: evidence.source,
    ...(evidence.source === "polymarket-public" ? { fallbackReason: evidence.fallbackReason } : {}),
  };
  const record = verdictRecord(data);
  console.log(`    ${verdict.label} [${evidence.source}]: sharp share ${(verdict.sharpShare * 100).toFixed(0)}%, forecast ${(verdict.forecast * 100).toFixed(1)}% vs price ${(move.to * 100).toFixed(1)}%, ${flows.length} wallets, checkpoint ${checkpoint.sequence}`);
  if (evidence.fallbackReason) console.log(`    fallback: ${evidence.fallbackReason}`);
  if (DRY) { console.log("    dry run: not sealed"); return false; }

  const t0 = Date.now();
  const stored = await store.remember(NAMESPACES.verdicts, encode(record));
  console.log(`    sealed in ${((Date.now() - t0) / 1000).toFixed(0)}s, blob ${stored.blobId}`);
  const ledger = await readJson<LedgerEntry[]>(VERDICT_LEDGER_FILE, []);
  ledger.push({
    key: verdictKey(c.marketId, move.endTs), blobId: stored.blobId, sealedAt: data.sealedAt, source: data.source,
    ...(data.fallbackReason ? { fallbackReason: data.fallbackReason } : {}), verdict: data,
  });
  await writeJson(VERDICT_LEDGER_FILE, ledger);
  return true;
}

const store = memoryStore();
do {
  let sealed = 0;
  try { sealed = await scan(store); }
  catch (e) {
    if (e instanceof TatumBudgetExceeded) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const { used, budget } = await tatumCallsUsed();
  console.log(`verdicts sealed this run: ${sealed}. Tatum calls used: ${used}/${budget} (${callsInLastHour(tatumLog, Date.now())} in the last hour)`);
  if (LOOP_MINUTES > 0) await sleep(LOOP_MINUTES * 60_000);
} while (LOOP_MINUTES > 0);
process.exit(0);
