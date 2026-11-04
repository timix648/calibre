// The spending guard of the buyer-agent demo (scripts/agent-pay-demo.ts), kept apart from the network code so it can be tested.

/** The default hard cap on paid calls in one run. */
export const DEFAULT_MAX_CALLS = 5;
/** No run may be configured above this, so a typo cannot drain the wallet. */
export const ABSOLUTE_MAX_CALLS = 25;
/** The most the demo will pay for one call, in USDC (the route's price). */
export const DEFAULT_MAX_PRICE_USDC = "0.01";
export const USDC_DECIMALS = 6;

const WALLET = /^0x[0-9a-fA-F]{40}$/;

/** Converts a decimal string such as "0.01" to raw USDC units (6 decimals) with no floating point. Throws on anything else. */
export function usdcToRaw(amount: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(amount.trim())) throw new Error(`"${amount}" is not a USDC amount with at most 6 decimals`);
  const [whole = "0", frac = ""] = amount.trim().split(".");
  return BigInt(whole + frac.padEnd(USDC_DECIMALS, "0"));
}

export function rawToUsdc(raw: bigint): string {
  const s = raw.toString().padStart(USDC_DECIMALS + 1, "0");
  return `${s.slice(0, -USDC_DECIMALS)}.${s.slice(-USDC_DECIMALS)}`;
}

/** The call cap from a flag or environment value: a whole number from 1 to 25, default 5. */
export function parseMaxCalls(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_MAX_CALLS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > ABSOLUTE_MAX_CALLS) {
    throw new Error(`--max-calls must be a whole number from 1 to ${ABSOLUTE_MAX_CALLS} (got "${raw}")`);
  }
  return n;
}

export class SpendCapExceeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpendCapExceeded";
  }
}

export interface Challenge {
  amount: string;
  currency: string;
  recipient: string;
}

/**
 * Decides, before every payment, whether the agent may pay: the run has calls left, the asked price is within the per-call
 * limit, and the coin is the one expected. It never pays itself; the demo calls `approve` with the challenge the server sent
 * and pays only if it returns.
 */
export class SpendGuard {
  private paidCalls = 0;
  private spentRaw = 0n;
  private readonly maxPriceRaw: bigint;

  constructor(
    readonly maxCalls: number,
    maxPriceUsdc: string,
    private readonly expectedCurrency: string,
  ) {
    if (!Number.isInteger(maxCalls) || maxCalls < 1 || maxCalls > ABSOLUTE_MAX_CALLS) throw new Error(`maxCalls must be 1 to ${ABSOLUTE_MAX_CALLS}`);
    this.maxPriceRaw = usdcToRaw(maxPriceUsdc);
  }

  get calls(): number { return this.paidCalls; }
  get spent(): string { return rawToUsdc(this.spentRaw); }
  /** The most this run can ever spend. */
  get ceiling(): string { return rawToUsdc(this.maxPriceRaw * BigInt(this.maxCalls)); }
  get callsLeft(): number { return this.maxCalls - this.paidCalls; }

  /** Throws SpendCapExceeded unless this payment is allowed, and otherwise counts it. */
  approve(challenge: Challenge): void {
    if (this.paidCalls >= this.maxCalls) throw new SpendCapExceeded(`the cap of ${this.maxCalls} paid calls for this run is reached`);
    if (challenge.currency !== this.expectedCurrency) throw new SpendCapExceeded(`the server asked for ${challenge.currency}, not the expected USDC coin`);
    let asked: bigint;
    try { asked = usdcToRaw(challenge.amount); } catch { throw new SpendCapExceeded(`the server asked for an unreadable amount (${challenge.amount})`); }
    if (asked > this.maxPriceRaw) throw new SpendCapExceeded(`the server asked for ${challenge.amount} USDC, above the limit of ${rawToUsdc(this.maxPriceRaw)} per call`);
    this.paidCalls++;
    this.spentRaw += asked;
  }
}

export interface WalletPlan {
  wallets: string[];
  /** Wallets dropped because the call cap was lower than the list. */
  skipped: string[];
  /** Entries that were not wallet addresses. */
  invalid: string[];
}

/** The wallets to buy X-rays for: valid, lower-cased, without duplicates, and no more than the cap allows. */
export function planWallets(requested: string[], maxCalls: number): WalletPlan {
  const seen = new Set<string>();
  const wallets: string[] = [];
  const skipped: string[] = [];
  const invalid: string[] = [];
  for (const entry of requested) {
    if (!WALLET.test(entry)) { invalid.push(entry); continue; }
    const w = entry.toLowerCase();
    if (seen.has(w)) continue;
    seen.add(w);
    (wallets.length < maxCalls ? wallets : skipped).push(w);
  }
  return { wallets, skipped, invalid };
}
