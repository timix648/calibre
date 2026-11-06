/**
 * Tatum's credit prices, per request, from its API reference (docs.tatum.io). A request is counted at its listed price, not as
 * "one call": price history costs twice what a market lookup does. Each Prediction endpoint's reference page states its own
 * cost, and these were read off those pages on 6 Nov 2026: market by id "100 credits per API call", price history "200 credits
 * per API call", wallet value "50 credits per API call".
 *
 * `grpcQuery: 2` is the one figure NOT confirmed for Sui. Tatum's RPC reference says "2 credits per any other RPC method"
 * (5 for eth_call, 50 for debug/trace), but that page is EVM-oriented and no public page prices Sui gRPC. The checkpoint stamp
 * is the only thing that uses it, so the exposure is small: even at 50 credits a query, a wallet X-ray goes from 102 to 150 and
 * a market X-ray from 202 to 250, which does not change any budget conclusion. Confirm it against the dashboard's usage view.
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

/**
 * Which Tatum plan the key belongs to. This decides the spending budgets, so it is one setting rather than a number copied
 * into two places: `free` is the 100,000-credit lifetime allowance, `starter` the paid 4,000,000 a month. Set `TATUM_PLAN`,
 * or `TATUM_PLAN_CREDITS` for an allowance that is neither (a hackathon top-up, or a share of a plan split with someone else).
 */
export type TatumPlan = "free" | "starter";
export const TATUM_PLAN_CREDITS: Record<TatumPlan, number> = { free: 100_000, starter: 4_000_000 };

/** Measured on 6 Nov 2026 by scripts/tatum-cost-model.ts: what the watcher spends in a day at 1.8 judged moves an hour. */
export const WATCHER_CREDITS_PER_DAY = 28_886;

/**
 * The spending budgets for an allowance, split between the watcher and the website. Both get a share of what is left after
 * the watcher's measured daily cost, and 20% of the site's share is held back so a traffic spike cannot reach the limit
 * (Tatum pauses a plan at 120% of its allotment). `days` is how long the allowance has to last: to the 17 Nov announcement.
 */
export function tatumBudgets(opts: { allowance: number; days: number }): { siteDaily: number; watcherTotal: number } {
  const { allowance, days } = opts;
  const watcherTotal = Math.min(WATCHER_CREDITS_PER_DAY * days, allowance * 0.75);
  const siteShare = Math.max(allowance - watcherTotal, 0) / days;
  return { siteDaily: Math.max(Math.floor((siteShare * 0.8) / 1000) * 1000, 1000), watcherTotal: Math.round(watcherTotal) };
}

/**
 * The budgets from the environment: `TATUM_DAILY_CREDITS` / `TATUM_CREDIT_BUDGET` win if set, otherwise they are worked out
 * from `TATUM_PLAN_CREDITS` or `TATUM_PLAN` (default `free`) over `TATUM_BUDGET_DAYS` (default 11).
 */
export function budgetsFromEnv(env: Record<string, string | undefined> = process.env): { siteDaily: number; watcherTotal: number; allowance: number; days: number } {
  const plan = (env.TATUM_PLAN === "starter" ? "starter" : "free") satisfies TatumPlan;
  const allowance = Number(env.TATUM_PLAN_CREDITS) || TATUM_PLAN_CREDITS[plan];
  const days = Number(env.TATUM_BUDGET_DAYS) || 11;
  const derived = tatumBudgets({ allowance, days });
  return {
    siteDaily: Number(env.TATUM_DAILY_CREDITS) || derived.siteDaily,
    watcherTotal: Number(env.TATUM_CREDIT_BUDGET) || derived.watcherTotal,
    allowance,
    days,
  };
}

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
