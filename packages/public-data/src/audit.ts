import { auditWallet, type ResolutionLike, type WalletAudit } from "@calibre/core";
import { fetchResolutions, fetchWalletTrades, isAddress, PublicApiError, type FetchOpts } from "./polymarket.js";

export const MAX_AUDIT_TRADES = 1000;

export interface WalletAuditResult {
  address: string;
  /** The profile name Polymarket shows for the wallet, when it has one. */
  name: string | null;
  audit: WalletAudit;
  /** Trades fetched (at most 1000, newest first). */
  tradesFetched: number;
  /** The wallet has more history than the 1000 newest trades audited. */
  truncated: boolean;
  /** Unix seconds of the oldest and newest trade fetched. */
  firstTradeAt: number | null;
  lastTradeAt: number | null;
  fetchedAt: string;
  source: "polymarket-public";
}

/** Fetch a wallet's newest trades and their resolutions from Polymarket's free public APIs and audit them. */
export async function auditAddress(address: string, opts: FetchOpts & { maxTrades?: number; now?: number } = {}): Promise<WalletAuditResult> {
  if (!isAddress(address)) throw new PublicApiError("not a wallet address");
  const { trades, name, truncated } = await fetchWalletTrades(address, Math.min(opts.maxTrades ?? MAX_AUDIT_TRADES, MAX_AUDIT_TRADES), opts);
  const resolutions: Map<string, ResolutionLike | null> = trades.length > 0 ? await fetchResolutions(trades.map((t) => t.conditionId), opts) : new Map();
  // Gamma answers in lower case; the trade rows keep their own case.
  const byTradeId = new Map<string, ResolutionLike | null>();
  for (const t of trades) byTradeId.set(t.conditionId, resolutions.get(t.conditionId.toLowerCase()) ?? null);
  const stamps = trades.map((t) => t.timestamp);
  return {
    address: address.toLowerCase(),
    name,
    audit: auditWallet(trades, byTradeId, opts.now !== undefined ? { now: opts.now } : {}),
    tradesFetched: trades.length,
    truncated,
    firstTradeAt: stamps.length ? Math.min(...stamps) : null,
    lastTradeAt: stamps.length ? Math.max(...stamps) : null,
    fetchedAt: new Date().toISOString(),
    source: "polymarket-public",
  };
}

/** A small in-memory cache with a time limit, for a server process that audits the same wallet repeatedly. */
export class TtlCache<V> {
  private readonly map = new Map<string, { value: V; expires: number }>();
  constructor(private readonly ttlMs: number, private readonly maxEntries = 500) {}

  get(key: string, now = Date.now()): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires <= now) { this.map.delete(key); return undefined; }
    return hit.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    if (this.map.size >= this.maxEntries) {
      for (const [k, v] of this.map) if (v.expires <= now) this.map.delete(k);
      if (this.map.size >= this.maxEntries) this.map.delete(this.map.keys().next().value!);
    }
    this.map.set(key, { value, expires: now + this.ttlMs });
  }
}

/** A fixed-window limiter: `limit` hits per key per `windowMs`. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private readonly limit: number, private readonly windowMs: number) {}

  /** Records a hit; returns seconds to wait when the key is over its limit, otherwise 0. */
  hit(key: string, now = Date.now()): number {
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    const cur = this.hits.get(key);
    if (!cur || cur.resetAt <= now) { this.hits.set(key, { count: 1, resetAt: now + this.windowMs }); return 0; }
    cur.count++;
    return cur.count > this.limit ? Math.ceil((cur.resetAt - now) / 1000) : 0;
  }
}
