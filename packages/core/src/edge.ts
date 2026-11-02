import { DAY_MS, decayWeight } from "./math.js";
import type { ScoredPick } from "./skill.js";

/**
 * Edge against the price paid: how much more often a wallet's bought outcomes win than their prices implied.
 * edge = weighted mean of (y - price). Under the null "the price was fair", each term has variance p(1-p),
 * which gives a standard error and a z-score, so luck and skill can be told apart.
 */
export interface Edge {
  /** Probability points, e.g. 0.05 = wins 5 points more often than the price implied. */
  edge: number;
  se: number;
  z: number;
  n: number;
  effN: number;
}

export function priceEdge(picks: Pick<ScoredPick, "pMkt" | "y" | "ts">[], opts: { halfLifeDays?: number; now?: number } = {}): Edge {
  const n = picks.length;
  if (n === 0) return { edge: 0, se: Infinity, z: 0, n: 0, effN: 0 };
  const halfLife = opts.halfLifeDays ?? 60;
  const now = opts.now ?? Math.max(...picks.map((p) => p.ts));
  let wSum = 0, w2Sum = 0, acc = 0, varAcc = 0;
  for (const p of picks) {
    const w = decayWeight((now - p.ts) / DAY_MS, halfLife);
    wSum += w; w2Sum += w * w;
    acc += w * (p.y - p.pMkt);
    varAcc += w * w * p.pMkt * (1 - p.pMkt);
  }
  const edge = acc / wSum;
  const se = Math.sqrt(varAcc) / wSum;
  return { edge, se, z: se > 0 ? edge / se : 0, n, effN: (wSum * wSum) / w2Sum };
}

/** Pull edge toward zero for small samples: n0 picks of evidence count half. */
export function shrunkEdge(e: Pick<Edge, "edge" | "effN">, n0 = 30): number {
  return e.effN > 0 ? e.edge * (e.effN / (e.effN + n0)) : 0;
}
