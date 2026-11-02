export interface PricePoint { ts: number; close: number }

export interface Move {
  from: number;
  to: number;
  startTs: number;
  endTs: number;
}

/**
 * The most recent move of at least `minJump` (probability points) within `windowMs`, ending at the last point.
 * Prices near 0 or 1 are ignored because small absolute moves there are routine.
 */
export function latestMove(points: PricePoint[], opts: { minJump?: number; windowMs?: number } = {}): Move | null {
  const minJump = opts.minJump ?? 0.05;
  const windowMs = opts.windowMs ?? 60 * 60_000;
  const last = points.at(-1);
  if (!last) return null;
  let best: Move | null = null;
  for (let i = points.length - 2; i >= 0; i--) {
    const p = points[i]!;
    if (last.ts - p.ts > windowMs) break;
    if (p.close <= 0.03 || p.close >= 0.97) continue;
    const jump = last.close - p.close;
    if (Math.abs(jump) >= minJump && (!best || Math.abs(jump) > Math.abs(best.to - best.from))) {
      best = { from: p.close, to: last.close, startTs: p.ts, endTs: last.ts };
    }
  }
  return best;
}
