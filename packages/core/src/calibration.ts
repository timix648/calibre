import type { Outcome } from "./brier";

export interface Bucket {
  lo: number;
  hi: number;
  n: number;
  meanP: number;
  freq: number;
}

/** Reliability diagram data: forecasts bucketed by probability vs observed frequency. */
export function calibrationBuckets(forecasts: { p: number; y: Outcome }[], bins = 10): Bucket[] {
  const out: Bucket[] = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, meanP: 0, freq: 0 }));
  for (const f of forecasts) {
    const b = out[Math.min(bins - 1, Math.floor(f.p * bins))]!;
    b.n++;
    b.meanP += f.p;
    b.freq += f.y;
  }
  for (const b of out) {
    if (b.n) { b.meanP /= b.n; b.freq /= b.n; }
  }
  return out;
}

/** Bookmaker decimal odds for all outcomes -> implied probabilities with the margin removed. */
export function devig(decimalOdds: number[]): number[] {
  const raw = decimalOdds.map((o) => 1 / o);
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => r / total);
}

export function disagrees(pA: number, pB: number, threshold = 0.05): boolean {
  return Math.abs(pA - pB) > threshold;
}
