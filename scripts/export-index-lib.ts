// Wallet index rows from data that is already on disk, plus the merge into an existing wallets.json.
// Nothing here touches the network: it reads the public-data cache (.cache/public) and the Tatum response cache
// (.cache/tatum) directly, with the same sha1 key scheme as scripts/public-source.ts and apps/worker/src/lib/config.ts.
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  onePickPerMarket, parseGammaTime, priceEdge, tradesToPicks,
  type ResolutionLike, type WalletEdgeRow,
} from "../packages/core/src/index.js";

/** Same half-life as the worker's wallet index (apps/worker/src/lib/wallet-index.ts). */
export const HALF_LIFE_DAYS = 60;

/** A Polymarket trade in the fields the scoring reads (the shape of Tatum's /wallets/{addr}/trades). */
export interface CachedTrade {
  proxyWallet: string; side: "BUY" | "SELL"; conditionId: string; size: number; price: number; timestamp: number;
  title: string; slug: string; eventSlug: string; outcome: string; outcomeIndex: number;
}

interface V2Trade {
  proxy_wallet: string; side: "BUY" | "SELL"; condition_id: string; size: number; price: number; timestamp: number;
  title: string; slug: string; event_slug: string; outcome: string; outcome_index: number;
}

const fromV2 = (t: V2Trade): CachedTrade => ({
  proxyWallet: t.proxy_wallet, side: t.side, conditionId: t.condition_id, size: t.size, price: t.price,
  timestamp: t.timestamp, title: t.title, slug: t.slug, eventSlug: t.event_slug, outcome: t.outcome, outcomeIndex: t.outcome_index,
});

/** File of a cache entry: <dir>/<sha1 of the key>.json, the scheme of public-source.ts (and of the Tatum cache, keyed by request path). */
export const cacheFile = (dir: string, key: string): string => `${dir}/${createHash("sha1").update(key).digest("hex")}.json`;

async function readEntry<T>(dir: string, key: string): Promise<T | null> {
  try { return JSON.parse(await readFile(cacheFile(dir, key), "utf8")) as T; } catch { return null; }
}

export interface CachedHistory {
  trades: CachedTrade[];
  /** True when the cache stops before `max` trades although Polymarket had more (a page was never fetched). */
  partial: boolean;
}

/**
 * The cached trade history of a wallet, like `publicWalletHistory(address, max)` but never fetching. Null when no first
 * page is on disk. Pages fetched before Data API v1 was retired (`trades:<addr>:<offset>`) are read first, then v2 pages
 * (`v2trades:<addr>:<cursor>`) following the cursor chain.
 */
export async function cachedWalletHistory(publicDir: string, address: string, max = 1000): Promise<CachedHistory | null> {
  const out: CachedTrade[] = [];
  if (await readEntry(publicDir, `trades:${address}:0`)) {
    // A missing later page ends the history here, exactly as publicWalletHistory does for v1 pages.
    for (let offset = 0; offset < max; offset += 500) {
      const page = await readEntry<CachedTrade[]>(publicDir, `trades:${address}:${offset}`);
      if (!page) break;
      out.push(...page);
      if (page.length < 500) break;
    }
    return { trades: out.slice(0, max), partial: false };
  }
  let cursor = "";
  for (;;) {
    const page = await readEntry<{ data: V2Trade[]; pagination: { has_more: boolean; next_cursor?: string } }>(publicDir, `v2trades:${address}:${cursor}`);
    if (!page) return cursor === "" ? null : { trades: out.slice(0, max), partial: true };
    out.push(...page.data.map(fromV2));
    if (out.length >= max) return { trades: out.slice(0, max), partial: false };
    if (!page.pagination.has_more || !page.pagination.next_cursor) return { trades: out, partial: false };
    cursor = page.pagination.next_cursor;
  }
}

/** Start and close time of a Gamma market row, as `gammaMarketTimes` in public-source.ts. */
export function gammaTimes(m: any): Pick<ResolutionLike, "startTs" | "closeTs"> {
  const startTs = parseGammaTime(m?.gameStartTime) ?? parseGammaTime(m?.eventStartTime);
  const ends = [parseGammaTime(m?.endDate), parseGammaTime(m?.closedTime)].filter((x): x is number => x !== undefined);
  return {
    ...(startTs !== undefined ? { startTs } : {}),
    ...(ends.length > 0 ? { closeTs: Math.min(...ends) } : {}),
  };
}

/** A resolution from a cached Gamma row, as `publicResolution` in public-source.ts. Null if not cleanly resolved. */
export function resolutionFromGammaRow(m: any): ResolutionLike | null {
  if (!m?.outcomes || !m?.outcomePrices) return null;
  const outcomes: string[] = JSON.parse(m.outcomes);
  const prices: number[] = JSON.parse(m.outcomePrices).map(Number);
  const winner = prices.findIndex((p) => p >= 0.99);
  return winner >= 0 ? { outcome: outcomes[winner]!, outcomes, ...gammaTimes(m) } : null;
}

export interface CacheDirs { publicDir: string; tatumDir: string }

/**
 * The resolution of a market from cache only, the way the indexer's `loadResolutions` finds it: a cached Tatum market
 * with a resolution first (start time from the Gamma row when cached, close time from Tatum), else the cached Gamma row.
 * A market with nothing cached is null, exactly like one that has not resolved.
 */
export async function cachedResolution(dirs: CacheDirs, conditionId: string): Promise<ResolutionLike | null> {
  const tatum = await readEntry<{ body: { data: { resolution?: { outcome: string }; outcomes: { name: string }[]; closeTime: string } } }>(dirs.tatumDir, `/markets/${conditionId}`);
  const market = tatum?.body?.data;
  const gamma = await readEntry<any[]>(dirs.publicDir, `gamma:${conditionId}`);
  if (market?.resolution) {
    const times = gammaTimes(gamma?.[0]);
    const closeTs = Date.parse(market.closeTime);
    return {
      outcome: market.resolution.outcome, outcomes: market.outcomes.map((o) => o.name),
      ...(times.startTs !== undefined ? { startTs: times.startTs } : {}),
      ...(times.closeTs !== undefined ? { closeTs: times.closeTs } : Number.isFinite(closeTs) ? { closeTs } : {}),
    };
  }
  return gamma ? resolutionFromGammaRow(gamma[0]) : null;
}

/**
 * One row per league the wallet has resolved pre-game bets in: edge against the price paid, half-life 60 days.
 * The same computation as `walletRows` in apps/worker/src/lib/wallet-index.ts, kept here so this script needs no worker code.
 */
export function indexRows(
  wallet: string, trades: CachedTrade[], resolutions: Map<string, ResolutionLike | null>, updatedAt: string,
): WalletEdgeRow[] {
  const picks = tradesToPicks(trades, resolutions, 0.25);
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

/**
 * Merge `incoming` rows into `existing`, one row per (wallet, league). The row with the later `updatedAt` wins; on a tie
 * (or an unreadable date) the incoming row wins. Sorted by z, highest first, like the worker's index.
 */
export function mergeRows(existing: WalletEdgeRow[], incoming: WalletEdgeRow[]): WalletEdgeRow[] {
  const key = (r: Pick<WalletEdgeRow, "wallet" | "league">) => `${r.wallet.toLowerCase()}:${r.league}`;
  const byKey = new Map<string, WalletEdgeRow>();
  for (const r of existing) byKey.set(key(r), r);
  for (const r of incoming) {
    const old = byKey.get(key(r));
    const oldAt = old ? Date.parse(old.updatedAt) : NaN, newAt = Date.parse(r.updatedAt);
    if (!old || !Number.isFinite(oldAt) || !Number.isFinite(newAt) || newAt >= oldAt) byKey.set(key(r), r);
  }
  return [...byKey.values()].sort((a, b) => b.z - a.z);
}

/** The first wallet-like strings (0x + 40 hex) of a list, lower-cased and de-duplicated, in order. */
export function uniqueWallets(...lists: Iterable<string>[]): string[] {
  const seen = new Set<string>();
  for (const list of lists) for (const w of list) if (/^0x[0-9a-fA-F]{40}$/.test(w)) seen.add(w.toLowerCase());
  return [...seen];
}

/** Taker wallets of one line of square-replay.jsonl (a move with `takers[].wallet`); empty for a line that does not parse. */
export function takersOfReplayLine(line: string): string[] {
  try {
    const row = JSON.parse(line) as { takers?: { wallet?: unknown }[] };
    return (row.takers ?? []).map((t) => t.wallet).filter((w): w is string => typeof w === "string");
  } catch { return []; }
}
