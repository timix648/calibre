/**
 * Tatum's credit prices, per request, from its API reference (docs.tatum.io, November 2026). A request is counted at its listed
 * price, not as "one call": price history costs twice what a market lookup does, and a Sui gRPC query costs 2.
 */
export const TATUM_CREDITS = {
  grpcQuery: 2,
  events: 100,
  market: 100,
  marketPrice: 100,
  marketTradesPage: 100,
  marketHistory: 200,
  walletValue: 50,
  walletMarketsTraded: 50,
  walletTradesPage: 100,
} as const;

export type TatumCreditKind = keyof typeof TATUM_CREDITS;

/** The credit price of a Prediction Markets API path (`/v4/data/prediction/...`), or of a gRPC query. */
export function creditCost(pathOrKind: string): number {
  if (pathOrKind in TATUM_CREDITS) return TATUM_CREDITS[pathOrKind as TatumCreditKind];
  const p = pathOrKind.split("?")[0]!;
  if (/\/markets\/[^/]+\/history$/.test(p)) return TATUM_CREDITS.marketHistory;
  if (/\/wallets\/[^/]+\/(value|markets-traded)$/.test(p)) return TATUM_CREDITS.walletValue;
  if (/\/top-traders$|\/wallets\/[^/]+\/portfolio$/.test(p)) return 200;
  if (/\/search$/.test(p)) return 50;
  return 100; // events, markets, price, orderbook, trades, positions, wallet history and trades: 100 each
}

export interface CreditMeterState {
  day: string;
  spent: number;
  budget: number;
  requests: number;
  pausedUntil: number | null;
  lastError: string | null;
}

/**
 * Counts credits spent per UTC day against a budget and pauses Tatum after a plan error (402) so an empty key costs nothing
 * and slows nothing down. Callers ask `allow(cost)` before a request and fall back to free data when it says no.
 */
export class CreditMeter {
  private s: CreditMeterState;

  constructor(private readonly opts: { dailyBudget: number; now?: () => number }) {
    this.s = { day: this.today(), spent: 0, budget: opts.dailyBudget, requests: 0, pausedUntil: null, lastError: null };
  }

  private now(): number { return (this.opts.now ?? Date.now)(); }
  private today(): string { return new Date(this.now()).toISOString().slice(0, 10); }
  private roll(): void {
    const d = this.today();
    if (d !== this.s.day) this.s = { ...this.s, day: d, spent: 0, requests: 0 };
  }

  /** Whether a request of this price may run now: within today's budget and not paused. */
  allow(cost: number): boolean {
    this.roll();
    if (this.s.pausedUntil !== null && this.now() < this.s.pausedUntil) return false;
    return this.s.spent + cost <= this.s.budget;
  }

  /** Records a request Tatum answered (credits are charged when Tatum executes it). */
  spend(cost: number): void {
    this.roll();
    this.s.spent += cost;
    this.s.requests++;
  }

  /** Stops Tatum use for a while, e.g. after a 402 (plan limit) or repeated failures. */
  pause(ms: number, reason: string): void {
    this.s.pausedUntil = this.now() + ms;
    this.s.lastError = reason;
  }

  state(): CreditMeterState {
    this.roll();
    return { ...this.s };
  }
}
