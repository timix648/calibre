// M1.2: watch live sports markets, judge price moves by who traded them, and seal each verdict in Walrus Memory.
//   pnpm --filter @calibre/worker watch [--min-jump 0.05] [--max-markets 20] [--loop 10] [--dry]
import {
  TatumBudgetExceeded, latestCheckpoint, type Market, type MarketTrade, type PredictionClient,
} from "../../../packages/chain/src/index.js";
import {
  aggregateFlows, candlePoints, judgeMove, latestMove, selectCandidates, verdictKey, verdictRecord, walletKey,
  type Candidate, type Move, type VerdictData, type VerdictWallet, type WalletEdgeRow,
} from "../../../packages/core/src/index.js";
import { encode, NAMESPACES, type MemoryStore } from "../../../packages/memory/src/index.js";
import {
  VERDICT_LEDGER_FILE, WATCH_STATE_FILE, cliArgs, memoryStore, predictionClient, readJson, sleep, suiClient, tatumCallsUsed, writeJson,
} from "./lib/config.js";
import type { LedgerEntry } from "./lib/ledger.js";
import { loadIndex, loadMemoryState, skillLookup } from "./lib/wallet-index.js";

const REJUDGE_AFTER_MS = 2 * 3_600_000;
const HISTORY_WINDOW_MS = 2 * 3_600_000;
/** The newest candle must be this recent, otherwise the market is idle or finished and a "move" would be old news. */
const FIVE_MIN_MS = 5 * 60_000;
/** Stop early when this many markets in a row have no candles at all (an empty feed, not quiet markets). */
const GIVE_UP_AFTER = 6;
const FRESH_CANDLE_MS = 25 * 60_000;

const args = cliArgs();
const MIN_JUMP = Number(args.get("min-jump") ?? 0.05);
const MAX_MARKETS = Number(args.get("max-markets") ?? 20);
const LOOP_MINUTES = args.has("loop") ? Number(args.get("loop") === "true" ? 10 : args.get("loop")) : 0;
const DRY = args.has("dry");

type WatchState = Record<string, number>;

async function scan(api: PredictionClient, store: MemoryStore): Promise<number> {
  const now = Date.now();
  const index = await loadIndex();
  const memoryState = await loadMemoryState();
  const judged = await readJson<WatchState>(WATCH_STATE_FILE, {});

  // Discovery: busiest active SPORTS events (by volume, then by liquidity), limited to games close to now.
  const events = [];
  for (const sort of ["volume_desc", "liquidity_desc"] as const) {
    events.push(...(await api.events({ platform: "polymarket", status: "active", category: "SPORTS", sort, limit: 100 })).data);
  }
  const candidates = selectCandidates(events, { now, maxMarkets: MAX_MARKETS });
  console.log(`${events.length} events listed, ${candidates.length} markets to check (min jump ${MIN_JUMP * 100} pts)`);

  let sealed = 0, active = 0, asked = 0, withCandles = 0;
  // Candles are requested on 5-minute boundaries so that repeated runs share cached responses.
  const end = Math.ceil(now / FIVE_MIN_MS) * FIVE_MIN_MS;
  for (const c of candidates) {
    if (asked >= GIVE_UP_AFTER && withCandles === 0) {
      console.log(`  Tatum returned no price history for the first ${asked} markets; stopping to save credits`);
      break;
    }
    if (now - (judged[c.marketId] ?? 0) < REJUDGE_AFTER_MS) { console.log(`  skip ${c.slug} (judged < 2h ago)`); continue; }
    const candles = await api.marketHistory(c.marketId, {
      interval: "5m", start: new Date(end - HISTORY_WINDOW_MS).toISOString(), end: new Date(end).toISOString(),
    });
    asked++;
    if (candles.length > 0) withCandles++;
    const points = candlePoints(candles);
    const last = points.at(-1);
    if (!last || now - last.ts > FRESH_CANDLE_MS) continue;
    active++;
    const move = latestMove(points, { minJump: MIN_JUMP, windowMs: 60 * 60_000 });
    if (!move) continue;
    console.log(`  MOVE ${c.slug} ${c.marketId.slice(0, 10)}: ${(move.from * 100).toFixed(0)}% -> ${(move.to * 100).toFixed(0)}%`);
    try {
      if (await judgeAndSeal(api, store, c, move, index, memoryState)) { sealed++; judged[c.marketId] = Date.now(); await writeJson(WATCH_STATE_FILE, judged); }
    } catch (e) {
      if (e instanceof TatumBudgetExceeded) throw e;
      console.log(`  could not judge ${c.slug}: ${(e as Error).message}`);
    }
  }
  console.log(`${active} of ${candidates.length} markets traded in the last ${FRESH_CANDLE_MS / 60_000} minutes`);
  return sealed;
}

async function judgeAndSeal(
  api: PredictionClient, store: MemoryStore, c: Candidate, move: Move,
  index: WalletEdgeRow[], memoryState: Awaited<ReturnType<typeof loadMemoryState>>,
): Promise<boolean> {
  const market: Market = await api.market(c.marketId);
  if (market.status !== "active" || market.resolution) { console.log("    market is no longer active, skipped"); return false; }
  const yesOutcome = market.outcomes[0]?.name ?? "YES";

  // Trades from a little before the move began, so its first fills are included.
  const trades: MarketTrade[] = await api.marketTradesSince(c.marketId, move.startTs - 5 * 60_000, 5);
  const skill = skillLookup(index, c.league);
  const flows = aggregateFlows(
    trades.map((t) => ({ taker: t.taker.toLowerCase(), side: t.side, direction: t.direction, price: t.price, size: t.size })),
    skill,
  );
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
    forecast: verdict.forecast, priceAtVerdict: move.to, trades: trades.length, wallets: flows.length, topWallets,
    checkpoint: { sequence: checkpoint.sequence, digest: checkpoint.digest, timestamp: checkpoint.timestamp },
    sealedAt: new Date().toISOString(),
  };
  const record = verdictRecord(data);
  console.log(`    ${verdict.label}: sharp share ${(verdict.sharpShare * 100).toFixed(0)}%, forecast ${(verdict.forecast * 100).toFixed(1)}% vs price ${(move.to * 100).toFixed(1)}%, ${flows.length} wallets, checkpoint ${checkpoint.sequence}`);
  if (DRY) { console.log("    dry run: not sealed"); return false; }

  const t0 = Date.now();
  const stored = await store.remember(NAMESPACES.verdicts, encode(record));
  console.log(`    sealed in ${((Date.now() - t0) / 1000).toFixed(0)}s, blob ${stored.blobId}`);
  const ledger = await readJson<LedgerEntry[]>(VERDICT_LEDGER_FILE, []);
  ledger.push({ key: verdictKey(c.marketId, move.endTs), blobId: stored.blobId, sealedAt: data.sealedAt, verdict: data });
  await writeJson(VERDICT_LEDGER_FILE, ledger);
  return true;
}

const api = predictionClient();
const store = memoryStore();
do {
  let sealed = 0;
  try { sealed = await scan(api, store); }
  catch (e) {
    if (e instanceof TatumBudgetExceeded) { console.error(e.message); process.exit(1); }
    throw e;
  }
  const { used, budget } = await tatumCallsUsed();
  console.log(`verdicts sealed this run: ${sealed}. Tatum calls used: ${used}/${budget}`);
  if (LOOP_MINUTES > 0) await sleep(LOOP_MINUTES * 60_000);
} while (LOOP_MINUTES > 0);
process.exit(0);
