// M1.1: build the wallet skill index and seal wallet memories.
//   pnpm index [--extra 150] [--max-memories 100] [--trades 1000] [--no-memory] [--reuse]
// --reuse keeps the wallets already in the index instead of looking for new ones.
import type { WalletTrade } from "../../../packages/chain/src/index.js";
import { MIN_BETS_FOR_VERDICT, type ResolutionLike, type WalletEdgeRow } from "../../../packages/core/src/index.js";
import { publicMarketTakers, publicWalletHistory, recentClosedGameMarkets } from "../../../scripts/public-source.js";
import { WALLET_INDEX_FILE, cliArgs, memoryStore, readJson, writeJson } from "./lib/config.js";
import { loadResolutions, sealWalletMemories, walletRows } from "./lib/wallet-index.js";

const args = cliArgs();
const EXTRA = Number(args.get("extra") ?? 150);
const MAX_MEMORIES = Number(args.get("max-memories") ?? 100);
const TRADES = Number(args.get("trades") ?? 1000);
const WRITE_MEMORY = !args.has("no-memory");

/** Wallets studied in the persistence experiment (results file plus the saved active sample). */
async function studiedWallets(): Promise<string[]> {
  const results = await readJson<{ rows?: { wallet: string }[] }>("docs/skill-persistence-results.json", {});
  const sample = await readJson<string[]>(".cache/active-sample.json", []);
  return [...new Set([...(results.rows ?? []).map((r) => r.wallet), ...sample].map((w) => w.toLowerCase()))];
}

/** Active takers of recently closed game markets, found through the free public API. */
async function recentTakers(exclude: Set<string>, want: number): Promise<string[]> {
  if (want <= 0) return [];
  const markets = await recentClosedGameMarkets(120);
  const seen = new Map<string, number>();
  for (const m of markets) {
    for (const w of new Set(await publicMarketTakers(m.conditionId, 500))) {
      const wallet = w.toLowerCase();
      if (!exclude.has(wallet)) seen.set(wallet, (seen.get(wallet) ?? 0) + 1);
    }
  }
  console.log(`  ${markets.length} recent closed game markets, ${seen.size} new takers`);
  return [...seen].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, want).map(([w]) => w);
}

const studied = await studiedWallets();
console.log(`studied wallets: ${studied.length}`);
const previous = args.has("reuse") ? [...new Set((await readJson<WalletEdgeRow[]>(WALLET_INDEX_FILE, [])).map((r) => r.wallet))] : [];
const extra = args.has("reuse") ? previous.filter((w) => !studied.includes(w)) : await recentTakers(new Set(studied), EXTRA);
const wallets = [...studied, ...extra];
console.log(`indexing ${wallets.length} wallets (${extra.length} beyond the studied set), up to ${TRADES} trades each`);

// 1. Trades (free public API; cached on disk)
const histories = new Map<string, WalletTrade[]>();
for (const [i, w] of wallets.entries()) {
  try { histories.set(w, await publicWalletHistory(w, TRADES)); }
  catch (e) { console.log(`  skip ${w}: ${(e as Error).message}`); }
  if ((i + 1) % 25 === 0) console.log(`  trades ${i + 1}/${wallets.length}`);
}

// 2. Resolutions (cached Tatum responses, then Gamma in batches; "not closed yet" entries are re-checked after 12 h)
const marketIds = [...new Set([...histories.values()].flatMap((t) => t.map((x) => x.conditionId)))];
console.log(`resolving ${marketIds.length} markets`);
const resolutions = new Map<string, ResolutionLike | null>();
await loadResolutions(marketIds, resolutions, { maxEmptyAgeMs: 12 * 3_600_000 });
console.log(`  resolved ${[...resolutions.values()].filter(Boolean).length}/${marketIds.length}`);

// 3. Edge per wallet and league
const updatedAt = new Date().toISOString();
const rows: WalletEdgeRow[] = [];
for (const [w, trades] of histories) rows.push(...walletRows(w, trades, resolutions, updatedAt));
rows.sort((a, b) => b.z - a.z);
await writeJson(WALLET_INDEX_FILE, rows);

const walletsWithRows = new Set(rows.map((r) => r.wallet)).size;
const eligible = rows.filter((r) => r.n >= MIN_BETS_FOR_VERDICT);
console.log(`index: ${rows.length} wallet-league rows for ${walletsWithRows} wallets; ${eligible.length} with n >= ${MIN_BETS_FOR_VERDICT}`);
console.log(`  skill (z >= 2): ${eligible.filter((r) => r.z >= 2).length}, negative (z <= -2): ${eligible.filter((r) => r.z <= -2).length}`);
for (const r of eligible.slice(0, 5)) console.log(`  ${r.wallet.slice(0, 10)} ${r.league} edge ${(r.edge * 100).toFixed(1)} pts z ${r.z.toFixed(1)} n ${r.n}`);

// 4. Wallet memories: the most informative rows first (largest |z|), capped to keep the Walrus bill modest
if (WRITE_MEMORY) {
  const ranked = [...eligible].sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, MAX_MEMORIES);
  const written = await sealWalletMemories(memoryStore(), ranked);
  console.log(`wallet memories written: ${written}`);
}
