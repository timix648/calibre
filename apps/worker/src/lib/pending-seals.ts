import type { VerdictData } from "../../../../packages/core/src/index.js";

/** A verdict is tried this many times in all (the first attempt included) before it is given up. */
export const MAX_SEAL_ATTEMPTS = 6;
/** A Walrus write normally takes 6 to 25 seconds; one that takes this long is treated as failed. */
export const SEAL_TIMEOUT_MS = 120_000;

/**
 * A verdict whose Walrus write failed or timed out. It keeps the data exactly as judged (checkpoint, move and `sealedAt`, the
 * time of judgement), so a late seal says what was known when the move was judged and nothing later.
 */
export interface PendingSeal {
  key: string;
  data: VerdictData;
  /** Writes tried so far, the first one included. */
  attempts: number;
  lastAttemptAt: string;
  lastError: string;
}

/** What the market looks like now: `unknown` when the check itself failed. */
export type MarketState = "open" | "resolved" | "unknown";

export type SealDecision = "retry" | "drop-resolved" | "give-up" | "wait";

/**
 * What to do with a pending verdict on this pass. A resolved market is always dropped, whatever the attempts: a verdict is
 * never sealed once the outcome is known. When the check failed the pass waits rather than risk sealing after the outcome.
 */
export function decideSeal(entry: Pick<PendingSeal, "attempts">, market: MarketState, maxAttempts = MAX_SEAL_ATTEMPTS): SealDecision {
  if (market === "resolved") return "drop-resolved";
  if (entry.attempts >= maxAttempts) return "give-up";
  if (market === "unknown") return "wait";
  return "retry";
}

/** Adds a verdict whose first write failed. A key that is already queued is replaced, so a move is never queued twice. */
export function queueSeal(list: PendingSeal[], key: string, data: VerdictData, error: string, now: number): PendingSeal[] {
  const entry: PendingSeal = { key, data, attempts: 1, lastAttemptAt: new Date(now).toISOString(), lastError: error };
  return [...list.filter((p) => p.key !== key), entry];
}

/** Counts one more failed write on a queued verdict. */
export function recordSealFailure(list: PendingSeal[], key: string, error: string, now: number): PendingSeal[] {
  return list.map((p) => p.key === key ? { ...p, attempts: p.attempts + 1, lastAttemptAt: new Date(now).toISOString(), lastError: error } : p);
}

export const removeSeal = (list: PendingSeal[], key: string): PendingSeal[] => list.filter((p) => p.key !== key);

/** Minutes between judging a move and sealing it, to one decimal place and never negative. */
export function sealDelayMinutes(judgedAt: string | number, sealedAt: string | number): number {
  const ms = new Date(sealedAt).getTime() - new Date(judgedAt).getTime();
  return Math.max(0, Math.round(ms / 6_000) / 10);
}

/** Rejects after `ms` so a write that hangs counts as failed. The write itself is not cancelled and may still land later. */
export function withTimeout<T>(run: Promise<T>, ms: number, what = "write"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what} timed out after ${Math.round(ms / 1000)}s`)), ms); });
  return Promise.race([run, limit]).finally(() => clearTimeout(timer));
}
