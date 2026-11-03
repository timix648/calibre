import { clamp, logit, sigmoid } from "./math";

export interface Signal {
  /** Source's probability for YES. */
  p: number;
  /** Learned weight (from shrunkWeight). */
  w: number;
  sourceId?: string;
}

export interface BlendOptions {
  /** How far a fully trusted source can pull the market (0..1). Default 0.5. */
  alpha?: number;
  floor?: number;
  ceil?: number;
}

export interface BlendResult {
  p: number;
  /** Each source's contribution in logit units, for the Why panel. */
  contributions: { sourceId?: string; delta: number }[];
}

/**
 * Logit pooling around the market price:
 *   logit(p) = logit(pMkt) + alpha * sum_i w_i * (logit(p_i) - logit(pMkt))
 * Zero weights return the market price unchanged.
 */
export function blend(pMkt: number, signals: Signal[], opts: BlendOptions = {}): BlendResult {
  const alpha = opts.alpha ?? 0.5;
  const base = logit(pMkt);
  const contributions = signals.map((s) => ({ sourceId: s.sourceId, delta: alpha * s.w * (logit(s.p) - base) }));
  const L = base + contributions.reduce((acc, c) => acc + c.delta, 0);
  return { p: clamp(sigmoid(L), opts.floor ?? 0.01, opts.ceil ?? 0.99), contributions };
}

/** Memory OFF baseline: every source gets the same weight 1/N. */
export function equalWeightBlend(pMkt: number, signals: Omit<Signal, "w">[], opts: BlendOptions = {}): BlendResult {
  const w = signals.length ? 1 / signals.length : 0;
  return blend(pMkt, signals.map((s) => ({ ...s, w })), opts);
}
