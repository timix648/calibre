import { parseGammaTime, type ResolutionLike, type TradeLike } from "@calibre/core";

export const DATA_API = "https://data-api.polymarket.com";
export const GAMMA_API = "https://gamma-api.polymarket.com";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** A fill from Polymarket's Data API v2 (`/v2/trades`, snake_case fields). */
export interface V2Trade {
  proxy_wallet: string;
  side: "BUY" | "SELL";
  condition_id: string;
  size: number;
  price: number;
  /** Unix seconds. */
  timestamp: number;
  title: string;
  slug: string;
  event_slug: string;
  outcome: string;
  outcome_index: number;
  name?: string;
  pseudonym?: string;
}

/** A wallet trade in the shape the audit reads, plus the fields a page shows. */
export interface PublicWalletTrade extends TradeLike {
  title: string;
  eventSlug: string;
}

export function fromV2(t: V2Trade): PublicWalletTrade {
  return {
    conditionId: t.condition_id, side: t.side, price: t.price, size: t.size, timestamp: t.timestamp,
    outcome: t.outcome, slug: t.slug, title: t.title, eventSlug: t.event_slug,
  };
}

export class PublicApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PublicApiError";
  }
}

export interface FetchOpts {
  /** Attempts per request (default 3). */
  attempts?: number;
  timeoutMs?: number;
}

export async function getJson<T>(url: string, opts: FetchOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  let last = "";
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000), headers: { accept: "application/json" } });
      if (res.ok) return (await res.json()) as T;
      last = `${res.status}`;
      if (res.status !== 429 && res.status < 500) throw new PublicApiError(`Polymarket answered ${res.status}`, res.status);
    } catch (e) {
      if (e instanceof PublicApiError) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
    if (attempt < attempts - 1) await sleep(500 * 2 ** attempt);
  }
  throw new PublicApiError(`Polymarket did not answer (${last})`);
}

export const isAddress = (s: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(s);

export interface WalletHistory {
  trades: PublicWalletTrade[];
  /** The profile name Polymarket shows for the wallet, when it has one. */
  name: string | null;
  /** More trades exist than were fetched. */
  truncated: boolean;
}

/** The wallet's most recent trades, newest first, `max` at most (pages of 500 with the v2 cursor). */
export async function fetchWalletTrades(address: string, max = 1000, opts: FetchOpts = {}): Promise<WalletHistory> {
  if (!isAddress(address)) throw new PublicApiError("not a wallet address");
  const trades: PublicWalletTrade[] = [];
  let name: string | null = null;
  let cursor = "";
  let more = false;
  while (trades.length < max) {
    const page = await getJson<{ data?: V2Trade[]; pagination?: { has_more?: boolean; next_cursor?: string } }>(
      `${DATA_API}/v2/trades?user=${address.toLowerCase()}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, opts);
    const rows = page.data ?? [];
    name ??= rows.find((r) => r.name)?.name || rows.find((r) => r.pseudonym)?.pseudonym || null;
    trades.push(...rows.map(fromV2));
    more = Boolean(page.pagination?.has_more && page.pagination.next_cursor);
    if (!more || rows.length === 0) break;
    cursor = page.pagination!.next_cursor!;
  }
  return { trades: trades.slice(0, max), name, truncated: more || trades.length > max };
}

/**
 * When a Gamma market started and closed. `startTs` is the game or event start (`gameStartTime`, else `eventStartTime`;
 * `startDate` is when the market was listed, not when play began). `closeTs` is the earlier of the scheduled end and the actual close.
 */
export function gammaMarketTimes(m: any): Pick<ResolutionLike, "startTs" | "closeTs"> {
  const startTs = parseGammaTime(m?.gameStartTime) ?? parseGammaTime(m?.eventStartTime);
  const ends = [parseGammaTime(m?.endDate), parseGammaTime(m?.closedTime)].filter((x): x is number => x !== undefined);
  return {
    ...(startTs !== undefined ? { startTs } : {}),
    ...(ends.length > 0 ? { closeTs: Math.min(...ends) } : {}),
  };
}

/** The resolution of a closed Gamma market: the outcome whose final price is 1, with the start and close times. Null if not cleanly resolved. */
export function gammaResolution(m: any): ResolutionLike | null {
  if (!m?.outcomes || !m?.outcomePrices) return null;
  try {
    const outcomes: string[] = typeof m.outcomes === "string" ? JSON.parse(m.outcomes) : m.outcomes;
    const prices: number[] = (typeof m.outcomePrices === "string" ? JSON.parse(m.outcomePrices) : m.outcomePrices).map(Number);
    const winner = prices.findIndex((p) => p >= 0.99);
    return winner >= 0 && outcomes[winner] !== undefined ? { outcome: outcomes[winner]!, outcomes, ...gammaMarketTimes(m) } : null;
  } catch {
    return null;
  }
}

/**
 * Resolutions of many markets, 40 per Gamma request with a few requests in flight. Markets that are not closed, or closed
 * without a clean winner (a 50-50 split), map to null.
 */
export async function fetchResolutions(conditionIds: string[], opts: FetchOpts & { concurrency?: number } = {}): Promise<Map<string, ResolutionLike | null>> {
  const ids = [...new Set(conditionIds.map((id) => id.toLowerCase()))];
  const out = new Map<string, ResolutionLike | null>(ids.map((id) => [id, null]));
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += 40) batches.push(ids.slice(i, i + 40));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]!;
      const rows = await getJson<any[]>(`${GAMMA_API}/markets?closed=true&limit=100&${batch.map((id) => `condition_ids=${id}`).join("&")}`, opts);
      for (const row of rows) out.set(String(row.conditionId).toLowerCase(), gammaResolution(row));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency ?? 5, batches.length) }, worker));
  return out;
}

/**
 * Fills of one market, newest first, paged with the Data API v2 cursor until a fill older than `sinceMs` is seen or `maxPages`
 * pages (500 fills each) were read. Never cached. `reachedSince` says whether the pages went back as far as `sinceMs`.
 */
export async function fetchMarketTradesSince(
  conditionId: string, sinceMs: number, maxPages = 4, opts: FetchOpts = {},
): Promise<{ trades: V2Trade[]; pages: number; reachedSince: boolean }> {
  const trades: V2Trade[] = [];
  let cursor = "";
  let pages = 0;
  let reachedSince = false;
  while (pages < maxPages) {
    const r = await getJson<{ data?: V2Trade[]; pagination?: { has_more?: boolean; next_cursor?: string } }>(
      `${DATA_API}/v2/trades?condition=${conditionId}&limit=500${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, opts);
    pages++;
    const rows = r.data ?? [];
    const fresh = rows.filter((t) => t.timestamp * 1000 >= sinceMs);
    trades.push(...fresh);
    if (fresh.length < rows.length) { reachedSince = true; break; }
    if (!r.pagination?.has_more || !r.pagination.next_cursor) { reachedSince = true; break; }
    cursor = r.pagination.next_cursor;
  }
  return { trades, pages, reachedSince };
}
