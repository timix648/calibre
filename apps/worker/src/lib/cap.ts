import { hasHourlyRoom } from "../../../../packages/core/src/index.js";

/** Thrown when a Tatum call is needed but the hourly cap is reached. */
export class HourlyCapReached extends Error {
  constructor(readonly cap: number) { super(`Tatum hourly call cap (${cap}) reached`); }
}

/**
 * The hourly Tatum allowance of one watcher process. Real runs and `--dry` runs both go through it: a dry run spends real
 * credits, so it has no way around the cap.
 */
export class TatumCap {
  constructor(readonly cap: number, private log: number[] = []) {}

  /** Credits spent in the last hour, one timestamp each. */
  get entries(): number[] { return this.log; }

  room(now: number, reserve = 0): boolean { return hasHourlyRoom(this.log, now, this.cap, reserve); }

  /** Records `spent` credits at `now` and forgets entries older than an hour. */
  record(spent: number, now: number): number[] {
    this.log = [...this.log.filter((t) => now - t < 3_600_000), ...Array<number>(Math.max(0, spent)).fill(now)];
    return this.log;
  }

  /** Throws `HourlyCapReached` unless a call may be made now. */
  require(now: number, reserve = 0): void {
    if (!this.room(now, reserve)) throw new HourlyCapReached(this.cap);
  }
}

/**
 * Whether a market was judged within `windowMs`. A dry run seals nothing and must not write the watch state, so its own
 * judgements are kept apart (`dry`) and still count here: without that it would judge a market again on every pass.
 */
export function recentlyJudged(
  sealed: Record<string, number>, dry: ReadonlyMap<string, number>, marketId: string, now: number, windowMs: number,
): boolean {
  return now - Math.max(sealed[marketId] ?? 0, dry.get(marketId) ?? 0) < windowMs;
}
