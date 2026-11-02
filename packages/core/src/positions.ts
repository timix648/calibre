import { clamp } from "./math.js";

export type Side = "YES" | "NO";

export interface Trade {
  side: Side;
  /** Price paid for the side's share, 0..1. */
  price: number;
  sizeUsd: number;
  ts: number;
}

/**
 * Buying YES at q signals a belief above q; buying NO at (1 - q) signals a belief below q.
 * We place the implied belief a fraction k of the way toward certainty (documented assumption).
 * `price` here is the YES-equivalent price q.
 */
export function impliedProb(side: Side, yesPrice: number, k = 0.25): number {
  const q = clamp(yesPrice, 0.01, 0.99);
  const p = side === "YES" ? q + k * (1 - q) : q - k * q;
  return clamp(p, 0.02, 0.98);
}

/** Size-weighted implied YES probability across a source's trades in one market, or null if no size. */
export function aggregatePosition(trades: Trade[], k = 0.25): number | null {
  let w = 0, acc = 0;
  for (const t of trades) {
    if (!(t.sizeUsd > 0)) continue;
    const yesPrice = t.side === "YES" ? t.price : 1 - t.price;
    acc += t.sizeUsd * impliedProb(t.side, yesPrice, k);
    w += t.sizeUsd;
  }
  return w > 0 ? acc / w : null;
}
