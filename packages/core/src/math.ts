export const EPS = 1e-6;

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export function logit(p: number): number {
  const q = clamp(p, EPS, 1 - EPS);
  return Math.log(q / (1 - q));
}

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Weight of an observation `ageDays` old under exponential decay with the given half-life. */
export function decayWeight(ageDays: number, halfLifeDays: number): number {
  if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 1;
  return Math.pow(0.5, Math.max(0, ageDays) / halfLifeDays);
}

export const DAY_MS = 86_400_000;
