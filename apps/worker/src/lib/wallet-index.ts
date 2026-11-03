import type { Market, WalletTrade } from "../../../../packages/chain/src/index.js";
import {
  MIN_BETS_FOR_VERDICT, needsNewVersion, onePickPerMarket, priceEdge, tradesToPicks, walletKey, walletRecord,
  type ResolutionLike, type WalletEdgeRow, type WalletSkill,
} from "../../../../packages/core/src/index.js";
import { encode, NAMESPACES, type MemoryStore } from "../../../../packages/memory/src/index.js";
import { prefetchResolutions, publicResolution } from "../../../../scripts/public-source.js";
import { MEMORY_STATE_FILE, WALLET_INDEX_FILE, readJson, tatumCached, writeJson } from "./config.js";

export const HALF_LIFE_DAYS = 60;

/** Resolutions of the given markets: cached Tatum responses first, then Polymarket's Gamma API. */
export async function loadResolutions(
  conditionIds: string[],
  into = new Map<string, ResolutionLike | null>(),
  opts: { maxEmptyAgeMs?: number } = {},
): Promise<Map<string, ResolutionLike | null>> {
  const todo = [...new Set(conditionIds)].filter((id) => !into.has(id));
  const needGamma: string[] = [];
  for (const id of todo) {
    const hit = await tatumCached<{ data: Market }>(`/markets/${id}`);
    if (hit?.data.resolution) into.set(id, { outcome: hit.data.resolution.outcome, outcomes: hit.data.outcomes.map((o) => o.name) });
    else needGamma.push(id);
  }
  await prefetchResolutions(needGamma, opts);
  for (const id of needGamma) {
    try { into.set(id, await publicResolution(id)); } catch { into.set(id, null); }
  }
  return into;
}

/** One row per league the wallet has resolved bets in: edge against the price paid, half-life 60 days. */
export function walletRows(wallet: string, trades: WalletTrade[], resolutions: Map<string, ResolutionLike | null>, updatedAt: string): WalletEdgeRow[] {
  const picks = tradesToPicks(trades, resolutions);
  const byLeague = new Map<string, typeof picks>();
  for (const p of picks) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);
  const rows: WalletEdgeRow[] = [];
  for (const [league, list] of byLeague) {
    const e = priceEdge(onePickPerMarket(list), { halfLifeDays: HALF_LIFE_DAYS });
    if (e.n === 0 || !Number.isFinite(e.se)) continue;
    rows.push({ wallet: wallet.toLowerCase(), league, edge: e.edge, se: e.se, z: e.z, n: e.n, effN: e.effN, updatedAt });
  }
  return rows;
}

export async function loadIndex(): Promise<WalletEdgeRow[]> {
  const rows = await readJson<WalletEdgeRow[] | null>(WALLET_INDEX_FILE, null);
  if (!rows) throw new Error(`No wallet index at ${WALLET_INDEX_FILE}. Run: pnpm --filter @calibre/worker index`);
  return rows;
}

/** Skill lookup for one league, as aggregateFlows expects. */
export function skillLookup(rows: WalletEdgeRow[], league: string): (wallet: string) => WalletSkill | undefined {
  const byWallet = new Map<string, WalletEdgeRow>();
  for (const r of rows) if (r.league === league) byWallet.set(r.wallet, r);
  return (wallet) => byWallet.get(wallet.toLowerCase());
}

export interface MemoryState {
  version: number;
  edge: number;
  n: number;
  blobId: string;
}

export const loadMemoryState = () => readJson<Record<string, MemoryState>>(MEMORY_STATE_FILE, {});

/**
 * Write a wallet memory for every given row whose edge is new or moved by at least 0.5 pts since its last
 * version, 20 per request. Walrus Memory has no update, so each change is a higher version of the same key.
 * Returns how many memories were written.
 */
export async function sealWalletMemories(store: MemoryStore, rows: WalletEdgeRow[], log: (s: string) => void = console.log): Promise<number> {
  const state = await loadMemoryState();
  const todo = rows
    .filter((r) => r.n >= MIN_BETS_FOR_VERDICT && needsNewVersion(state[walletKey(r.wallet, r.league)]?.edge, r.edge));
  let written = 0;
  for (let i = 0; i < todo.length; i += 20) {
    const batch = todo.slice(i, i + 20);
    const records = batch.map((r) => walletRecord(r, (state[walletKey(r.wallet, r.league)]?.version ?? 0) + 1));
    const t0 = Date.now();
    const stored = await store.rememberBulk(NAMESPACES.wallets, records.map((r) => encode(r)));
    batch.forEach((row, j) => {
      const blobId = stored[j]?.blobId;
      if (!blobId) return;
      state[walletKey(row.wallet, row.league)] = { version: records[j]!.version, edge: row.edge, n: row.n, blobId };
      written++;
    });
    await writeJson(MEMORY_STATE_FILE, state);
    log(`  sealed ${Math.min(i + 20, todo.length)}/${todo.length} wallet memories (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  }
  return written;
}
