// M1.2: watch live sports and midterm-election markets, judge price moves by who traded them, and seal each verdict.
//   pnpm --filter @calibre/worker watch [--min-jump 0.05] [--max-markets 16] [--max-politics 14] [--loop 10] [--dry]
//                                       [--segment sports|politics|all] [--tatum-hourly 50] [--discover-every 60]
//
// Tatum is the primary source: every move is confirmed against Tatum's own price history (the `midpoint` feed) before it is
// judged, and a move Tatum's history does not show is skipped. Tatum's trades feed is still returning no fills for any
// Polymarket market, so the fills behind a verdict come from Polymarket's free public API and every verdict says so
// (`source`, `fallbackReason`). A feed that comes back empty is not asked again for 60 minutes, so it cannot burn credits.
import {
  PredictionApiError, TatumBudgetExceeded, anchorCheckpoint, type Market, type PredictionClient,
} from "../../../packages/chain/src/index.js";
import {
  BREAKER_HOLD_MS, MODEL_VERSION, aggregateFlows, breakerOpen, callsInLastHour, candlePoints, judgeMove, latestMove, priceSeriesFromTrades,
  publicTradesToFlows, selectCandidates, selectMidtermCandidates, tripBreaker, verdictKey, verdictRecord, verdictSquareMoney, walletKey, walletLabeler,
  type BreakerState, type Candidate, type DataSource, type FlowTrade, type Move, type TimedFlowTrade, type VerdictData,
  type VerdictWallet, type WalletEdgeRow,
} from "../../../packages/core/src/index.js";
import { encode, NAMESPACES, type MemoryStore } from "../../../packages/memory/src/index.js";
import { fetchResolutions } from "../../../packages/public-data/src/index";
import { publicMarketTradesSince } from "../../../scripts/public-source.js";
import {
  BREAKER_FILE, PENDING_SEALS_FILE, TATUM_LOG_FILE, VERDICT_LEDGER_FILE, WATCH_STATE_FILE, cliArgs, memoryStore, predictionClient, readJson, sleep,
  suiClient, tatumCallsUsed, writeJson,
} from "./lib/config.js";
import { HourlyCapReached, TatumCap, recentlyJudged } from "./lib/cap.js";
import { activeEvents } from "./lib/events.js";
import type { LedgerEntry } from "./lib/ledger.js";
import {
  MAX_SEAL_ATTEMPTS, SEAL_TIMEOUT_MS, decideSeal, queueSeal, recordSealFailure, removeSeal, sealDelayMinutes, withTimeout, type MarketState, type PendingSeal,
} from "./lib/pending-seals.js";
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
/**
 * Where the 10-minute scan reads prices. "public" (default): Polymarket's free fills scan every market, and Tatum confirms each
 * detected move with its own price history, then supplies the trades, market and live price behind the verdict. "tatum": Tatum
 * for every scan as well, which costs about 20 times more credits for the same verdicts (research/TATUM_BUDGET.md).
 */
const SCAN = args.get("scan") === "tatum" ? "tatum" : "public";
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
    tatumLog = cap.record(spent, Date.now());
    await writeJson(TATUM_LOG_FILE, tatumLog);
  }
}

const cap = new TatumCap(HOURLY_CAP, tatumLog);
const tatumRoom = (reserve = JUDGING_RESERVE) => cap.room(Date.now(), reserve);

/** A Tatum call that must pass the hourly cap; judging may spend the reserve that discovery and history leave free. */
async function capped<T>(run: () => Promise<T>): Promise<T> {
  cap.require(Date.now());
  return metered(run);
}

/** Markets a --dry run has already judged in this process (see `recentlyJudged`). */
const dryJudged = new Map<string, number>();

async function trip(marketId: string): Promise<void> {
  breaker = tripBreaker(breaker, marketId, Date.now(), BREAKER_HOLD_MS);
  await writeJson(BREAKER_FILE, breaker);
}

const describe = (e: unknown) => e instanceof PredictionApiError ? `HTTP ${e.status}` : (e as Error).message;

const clock = (ms: number) => new Date(ms).toISOString().slice(11, 16) + " UTC";

async function discover(now: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  // At the hourly cap listings come from disk only, so discovery never spends past it.
  const cacheOnly = !tatumRoom(0);
  if (cacheOnly) console.log(`Tatum hourly call cap (${HOURLY_CAP}) reached: using the event listings already on disk`);
  // If Tatum cannot answer (plan limit, outage), discovery uses the listings already on disk rather than stopping the watcher.
  const list = async (category: "SPORTS" | "POLITICS", sort: "volume_desc" | "liquidity_desc") => {
    try { return await metered(() => activeEvents(api, category, sort, DISCOVER_EVERY_MS, cacheOnly)); }
    catch (e) {
      if (e instanceof TatumBudgetExceeded || cacheOnly) throw e;
      console.log(`Tatum event listing failed (${describe(e)}): using the listings already on disk`);
      return activeEvents(api, category, sort, DISCOVER_EVERY_MS, true);
    }
  };
  if (SEGMENT !== "politics") {
    const events = [];
    for (const sort of ["volume_desc", "liquidity_desc"] as const) events.push(...await list("SPORTS", sort));
    out.push(...selectCandidates(events, { now, maxMarkets: MAX_MARKETS }));
  }
  if (SEGMENT !== "sports") {
    out.push(...selectMidtermCandidates(await list("POLITICS", "volume_desc"), { now, maxMarkets: MAX_POLITICS }));
  }
  return out;
}

/**
 * Price points of a market over the last two hours. Tatum first; when it is empty for an active market, failing, paused
 * by the breaker or out of its hourly allowance, the points come from Polymarket's public fills (5-minute closes).
 */
/**
 * Kept as a guard, not as a workaround. The empty answers seen on 3 to 5 Nov 2026 came from asking Tatum's default
 * `candlesticks` feed, which is dead for Polymarket; the client now asks for `midpoint`, which returns full series. If a feed
 * ever empties again, three empty answers in a row stop the asking for an hour rather than paying 200 credits for nothing.
 */
let historyEmptyStreak = 0;
let historySkipUntil = 0;

async function priceSeries(c: Candidate, end: number, now: number, mode: "tatum" | "public" = SCAN): Promise<{ points: ReturnType<typeof candlePoints>; evidence: Evidence }> {
  let reason: string;
  if (mode === "public") reason = "scanned with Polymarket public fills";
  else if (now < historySkipUntil) reason = `Tatum price history has been answering empty; not asked again until ${clock(historySkipUntil)}`;
  else if (breakerOpen(breaker, c.marketId, now)) reason = `Tatum history was empty for this market; not asked again until ${clock(breaker[c.marketId]!)}`;
  else if (!tatumRoom()) reason = `Tatum hourly call cap (${HOURLY_CAP}) reached`;
  else {
    try {
      const candles = await metered(() => api.marketHistory(c.marketId, {
        interval: "5m", start: new Date(end - HISTORY_WINDOW_MS).toISOString(), end: new Date(end).toISOString(),
      }));
      if (candles.length > 0) { historyEmptyStreak = 0; return { points: candlePoints(candles), evidence: { source: "tatum" } }; }
      if (++historyEmptyStreak >= 3) { historySkipUntil = now + 60 * 60_000; historyEmptyStreak = 0; }
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
  let sealed = 0;
  if (!DRY) sealed += await retryPendingSeals(store);
  const index = await loadIndex();
  const memoryState = await loadMemoryState();
  const judged = await readJson<WatchState>(WATCH_STATE_FILE, {});

  const candidates = await discover(now);
  const politics = candidates.filter((c) => c.league === "politics").length;
  console.log(`${candidates.length} markets to check (${candidates.length - politics} sports, ${politics} midterms; min jump ${MIN_JUMP * 100} pts)`);

  let active = 0, fromTatum = 0, fromPublic = 0;
  // Candles are requested on 5-minute boundaries so that repeated runs share cached responses.
  const end = Math.ceil(now / FIVE_MIN_MS) * FIVE_MIN_MS;
  for (const c of candidates) {
    if (recentlyJudged(judged, dryJudged, c.marketId, now, REJUDGE_AFTER_MS)) { console.log(`  skip ${c.slug} (judged < 2h ago)`); continue; }
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
    let move = latestMove(points, { minJump: MIN_JUMP, windowMs: 60 * 60_000 });
    if (!move) continue;
    let ev = evidence;
    if (SCAN === "public") {
      // Confirm the move on Tatum's own price history (one 200-credit request) before judging; the verdict then rests on Tatum data.
      const confirmed = await priceSeries(c, end, now, "tatum").catch((e) => { if (e instanceof TatumBudgetExceeded) throw e; return null; });
      const tatumMove = confirmed?.evidence.source === "tatum" ? latestMove(confirmed.points, { minJump: MIN_JUMP, windowMs: 60 * 60_000 }) : null;
      if (confirmed?.evidence.source === "tatum" && !tatumMove) { console.log(`  ${c.slug}: Tatum's history does not show the move; skipped`); continue; }
      if (tatumMove) { move = tatumMove; ev = confirmed!.evidence; fromTatum++; }
      else ev = { ...evidence, fallbackReason: confirmed?.evidence.fallbackReason ?? evidence.fallbackReason };
    }
    console.log(`  MOVE ${c.slug} ${c.marketId.slice(0, 10)}: ${(move.from * 100).toFixed(0)}% -> ${(move.to * 100).toFixed(0)}% [${ev.source}]`);
    try {
      const result = await judgeAndSeal(store, c, move, ev, index, memoryState);
      // A queued verdict counts as judged too: it waits for its seal, and the market is not judged again meanwhile.
      if (result) { judged[c.marketId] = Date.now(); await writeJson(WATCH_STATE_FILE, judged); }
      if (result === "sealed") sealed++;
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      console.log(`  could not judge ${c.slug}: ${e instanceof HourlyCapReached ? e.message : describe(e)}`);
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
      const trades = tatumRoom(0) ? await metered(() => api.marketTradesSince(c.marketId, since, 5)) : null;
      if (trades === null) {
        evidence = { source: "polymarket-public", fallbackReason: `Tatum hourly call cap (${HOURLY_CAP}) reached` };
        const all = await publicMarketTradesSince(c.marketId, since, 5);
        return { fills: publicTradesToFlows(all).filter((t) => t.ts >= since), evidence };
      }
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
): Promise<"sealed" | "queued" | false> {
  const market: Market = await capped(() => api.market(c.marketId));
  if (market.status !== "active" || market.resolution) { console.log("    market is no longer active, skipped"); return false; }
  const yesOutcome = market.outcomes[0]?.name ?? "YES";

  // The live price always comes from Tatum, whichever source found the move: the verdict is judged against it.
  const live = await capped(() => api.marketPrice(c.marketId));
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
  // Square money comes from the wallet index alone (every league pooled): no extra network call, and a wallet without an index row is not judged.
  const labelOf = walletLabeler(index);
  const square = verdictSquareMoney(flows, Math.sign(move.to - move.from), labelOf);

  const byWallet = new Map(index.filter((r) => r.league === c.league).map((r) => [r.wallet, r]));
  const topWallets: VerdictWallet[] = [...flows]
    .sort((a, b) => Math.abs(b.netYesUsd) - Math.abs(a.netYesUsd))
    .slice(0, 5)
    .map((f) => {
      const row = byWallet.get(f.wallet);
      return {
        wallet: f.wallet, league: c.league, netYesUsd: Math.round(f.netYesUsd * 100) / 100, edge: f.edge,
        z: row ? row.z : null, n: row ? row.n : null, blobId: memoryState[walletKey(f.wallet, c.league)]?.blobId ?? null,
        label: labelOf(f.wallet),
      };
    });

  const checkpoint = await anchorCheckpoint(suiClient());
  const data: VerdictData = {
    marketId: c.marketId, eventSlug: c.slug, league: c.league, question: market.question, yesOutcome,
    move, label: verdict.label, sharpShare: verdict.sharpShare,
    opposition: Number.isFinite(verdict.opposition) ? verdict.opposition : null,
    forecast: verdict.forecast, priceAtVerdict: move.to, trades: fills.length, wallets: flows.length, topWallets,
    squareShare: square.squareShare, squareCoverage: square.squareCoverage,
    checkpoint: { sequence: checkpoint.sequence, digest: checkpoint.digest, timestamp: checkpoint.timestamp, source: checkpoint.source },
    sealedAt: new Date().toISOString(),
    model: MODEL_VERSION,
    source: evidence.source,
    ...(evidence.source === "polymarket-public" ? { fallbackReason: evidence.fallbackReason } : {}),
  };
  console.log(`    ${verdict.label} [${evidence.source}]: sharp share ${(verdict.sharpShare * 100).toFixed(0)}%, forecast ${(verdict.forecast * 100).toFixed(1)}% vs price ${(move.to * 100).toFixed(1)}%, ${flows.length} wallets, checkpoint ${checkpoint.sequence}`);
  console.log(`    square money ${(square.squareShare * 100).toFixed(0)}% of the pushing money, judged ${(square.squareCoverage * 100).toFixed(0)}% (${square.money.squareWallets} proven-losing of ${square.money.wallets} pushing wallets)`);
  if (evidence.fallbackReason) console.log(`    fallback: ${evidence.fallbackReason}`);
  if (DRY) { dryJudged.set(c.marketId, Date.now()); console.log("    dry run: not sealed"); return false; }

  return sealVerdict(store, data, 1);
}

/** Verdicts whose Walrus write failed, waiting for the next passes (see `pending-seals.ts`). */
const loadPending = () => readJson<PendingSeal[]>(PENDING_SEALS_FILE, []);

/**
 * Writes a verdict to Walrus Memory within `SEAL_TIMEOUT_MS`. On success the ledger row records when it landed and how long it
 * waited. On failure the verdict is kept in the pending file with its original checkpoint, move and `sealedAt`, so it is not lost.
 */
async function sealVerdict(store: MemoryStore, data: VerdictData, attempt: number): Promise<"sealed" | "queued"> {
  const key = verdictKey(data.marketId, data.move.endTs);
  const t0 = Date.now();
  try {
    const stored = await withTimeout(store.remember(NAMESPACES.verdicts, encode(verdictRecord(data))), SEAL_TIMEOUT_MS, "Walrus write");
    const sealedAt = new Date();
    const delay = sealDelayMinutes(data.sealedAt, sealedAt.getTime());
    console.log(`    sealed in ${((Date.now() - t0) / 1000).toFixed(0)}s, blob ${stored.blobId}${attempt > 1 ? ` (attempt ${attempt}, ${delay} min after it was judged)` : ""}`);
    const ledger = await readJson<LedgerEntry[]>(VERDICT_LEDGER_FILE, []);
    ledger.push({
      key, blobId: stored.blobId, sealedAt: sealedAt.toISOString(), sealDelayMinutes: delay, source: data.source,
      ...(data.fallbackReason ? { fallbackReason: data.fallbackReason } : {}), verdict: data,
    });
    await writeJson(VERDICT_LEDGER_FILE, ledger);
    await writeJson(PENDING_SEALS_FILE, removeSeal(await loadPending(), key));
    return "sealed";
  } catch (e) {
    const reason = (e as Error).message;
    const pending = await loadPending();
    const kept = pending.some((p) => p.key === key)
      ? recordSealFailure(pending, key, reason, Date.now())
      : queueSeal(pending, key, data, reason, Date.now());
    await writeJson(PENDING_SEALS_FILE, kept);
    console.log(`    could not seal (attempt ${attempt} of ${MAX_SEAL_ATTEMPTS}): ${reason}; kept in ${PENDING_SEALS_FILE} for the next pass`);
    return "queued";
  }
}

/** Which of these markets have resolved, from Polymarket's free Gamma API (no Tatum credit). A failed check marks all unknown. */
async function marketStates(marketIds: string[]): Promise<Map<string, MarketState>> {
  try {
    const resolutions = await fetchResolutions(marketIds);
    return new Map(marketIds.map((id) => [id, resolutions.get(id.toLowerCase()) ? "resolved" : "open"] as const));
  } catch {
    return new Map(marketIds.map((id) => [id, "unknown"] as const));
  }
}

/** Retries the queued verdicts. A market that resolved meanwhile is dropped: nothing is sealed once the outcome is known. */
async function retryPendingSeals(store: MemoryStore): Promise<number> {
  const pending = await loadPending();
  if (pending.length === 0) return 0;
  console.log(`${pending.length} verdict(s) waiting to be sealed`);
  const states = await marketStates([...new Set(pending.map((p) => p.data.marketId))]);
  let sealed = 0;
  for (const p of pending) {
    const decision = decideSeal(p, states.get(p.data.marketId) ?? "unknown");
    const name = p.data.eventSlug;
    if (decision === "drop-resolved") {
      console.log(`  ${name}: resolved before it could be sealed, dropped (not sealed after the outcome)`);
      await writeJson(PENDING_SEALS_FILE, removeSeal(await loadPending(), p.key));
    } else if (decision === "give-up") {
      console.log(`  ${name}: gave up after ${p.attempts} attempts (last error: ${p.lastError}), dropped`);
      await writeJson(PENDING_SEALS_FILE, removeSeal(await loadPending(), p.key));
    } else if (decision === "wait") {
      console.log(`  ${name}: could not check whether the market resolved, waiting`);
    } else if (await sealVerdict(store, p.data, p.attempts + 1) === "sealed") sealed++;
  }
  return sealed;
}

const store = memoryStore();
do {
  let sealed = 0;
  try { sealed = await scan(store); }
  catch (e) {
    if (e instanceof TatumBudgetExceeded) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const { used, budget, credits, creditBudget } = await tatumCallsUsed();
  console.log(`verdicts sealed this run: ${sealed}. Tatum: ${credits.toLocaleString("en-US")}/${creditBudget.toLocaleString("en-US")} credits, ${used}/${budget} calls (${callsInLastHour(tatumLog, Date.now())} in the last hour)`);
  if (LOOP_MINUTES > 0) await sleep(LOOP_MINUTES * 60_000);
} while (LOOP_MINUTES > 0);
process.exit(0);
