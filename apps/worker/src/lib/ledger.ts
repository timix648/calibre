import type { DataSource, OutcomeData, VerdictData } from "../../../../packages/core/src/index.js";

/** A verdict as sealed in Walrus Memory, with the blob it landed in. */
export interface LedgerEntry {
  key: string;
  blobId: string;
  /** When the write to Walrus finished. The verdict inside keeps its own `sealedAt`, the time it was judged. */
  sealedAt: string;
  /** Minutes between judging the move and sealing it: a few seconds normally, longer when the write had to be retried. */
  sealDelayMinutes?: number;
  /** Where the market data came from; absent on rows written before the fallback existed (Tatum). */
  source?: DataSource;
  fallbackReason?: string;
  verdict: VerdictData;
}

/** A graded verdict and the blob of its outcome memory. */
export interface OutcomeEntry {
  key: string;
  blobId: string;
  outcome: OutcomeData;
}
