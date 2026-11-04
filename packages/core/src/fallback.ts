import type { FlowTrade } from "./attribution";
import type { PricePoint } from "./moves";

/** Where the evidence behind a verdict came from. Tatum is primary; Polymarket's public API is the labelled fallback. */
export type DataSource = "tatum" | "polymarket-public";

/** A fill from Polymarket's Data API v2 (`/v2/trades`, snake_case fields). */
export interface PublicTradeLike {
  proxy_wallet: string;
  side: "BUY" | "SELL";
  outcome_index: number;
  price: number;
  size: number;
  /** Unix seconds. */
  timestamp: number;
}

export interface TimedFlowTrade extends FlowTrade {
  /** Unix milliseconds. */
  ts: number;
}

/**
 * A public fill in the shape the attribution code reads. Outcome 0 is YES and outcome 1 is NO (the same order as
 * Tatum's `outcomes`); a fill on any other outcome belongs to a multi-outcome market and is dropped.
 */
export function publicTradeToFlow(t: PublicTradeLike): TimedFlowTrade | null {
  if (t.outcome_index !== 0 && t.outcome_index !== 1) return null;
  if (t.side !== "BUY" && t.side !== "SELL") return null;
  if (!(t.price > 0 && t.price < 1) || !(t.size > 0) || !Number.isFinite(t.timestamp)) return null;
  return {
    taker: t.proxy_wallet.toLowerCase(),
    side: t.outcome_index === 0 ? "yes" : "no",
    direction: t.side === "BUY" ? "buy" : "sell",
    price: t.price,
    size: t.size,
    ts: t.timestamp * 1000,
  };
}

export const publicTradesToFlows = (trades: PublicTradeLike[]): TimedFlowTrade[] =>
  trades.map(publicTradeToFlow).filter((t): t is TimedFlowTrade => t !== null);

/** The YES-side price a fill implies: a NO fill at p says YES is worth 1 - p. */
export const yesPriceOf = (t: FlowTrade): number => (t.side === "yes" ? t.price : 1 - t.price);

/**
 * Close prices of the YES outcome per time bucket, oldest first. A bucket's close is the price of its last fill;
 * buckets without fills are left out. Points are stamped with the bucket start, like Tatum candles.
 */
export function priceSeriesFromTrades(trades: TimedFlowTrade[], bucketMs = 5 * 60_000): PricePoint[] {
  const last = new Map<number, { ts: number; close: number }>();
  for (const t of trades) {
    const bucket = Math.floor(t.ts / bucketMs) * bucketMs;
    const held = last.get(bucket);
    if (!held || t.ts >= held.ts) last.set(bucket, { ts: t.ts, close: yesPriceOf(t) });
  }
  return [...last].map(([ts, v]) => ({ ts, close: v.close })).sort((a, b) => a.ts - b.ts);
}

/** Circuit breaker: when each key may be tried again, in unix milliseconds. */
export type BreakerState = Record<string, number>;

export const BREAKER_HOLD_MS = 60 * 60_000;

export const breakerOpen = (state: BreakerState, key: string, now: number): boolean => (state[key] ?? 0) > now;

/** Open the breaker for `key` and forget entries that have already expired. */
export function tripBreaker(state: BreakerState, key: string, now: number, holdMs = BREAKER_HOLD_MS): BreakerState {
  const next: BreakerState = {};
  for (const [k, until] of Object.entries(state)) if (until > now) next[k] = until;
  next[key] = now + holdMs;
  return next;
}

/** Number of recorded calls within the last hour; `log` holds one unix-millisecond timestamp per call. */
export const callsInLastHour = (log: number[], now: number): number => log.filter((t) => now - t < 3_600_000).length;

/**
 * Whether a Tatum call may be made without passing the hourly cap: `log` holds one unix-millisecond timestamp per credit
 * spent, and `reserve` calls are kept back for work that must not be starved (pass 0 to spend to the cap).
 */
export const hasHourlyRoom = (log: number[], now: number, cap: number, reserve = 0): boolean => callsInLastHour(log, now) < cap - reserve;
