export type Outcome = 0 | 1;

/** Brier score of a single probability forecast. Lower is better; 0 is perfect. */
export function brier(p: number, y: Outcome): number {
  return (p - y) ** 2;
}

export function meanBrier(forecasts: { p: number; y: Outcome }[]): number {
  if (forecasts.length === 0) return NaN;
  return forecasts.reduce((s, f) => s + brier(f.p, f.y), 0) / forecasts.length;
}
