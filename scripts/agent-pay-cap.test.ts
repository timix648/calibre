import { describe, expect, it } from "vitest";
import {
  ABSOLUTE_MAX_CALLS, DEFAULT_MAX_CALLS, SpendCapExceeded, SpendGuard, parseMaxCalls, planWallets, rawToUsdc, usdcToRaw,
} from "./agent-pay-cap";

const USDC_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const challenge = (amount = "0.01", currency = USDC_TYPE) => ({ amount, currency, recipient: "0x1" });

describe("USDC amounts", () => {
  it("converts without floating point", () => {
    expect(usdcToRaw("0.01")).toBe(10_000n);
    expect(usdcToRaw("1")).toBe(1_000_000n);
    expect(usdcToRaw("0.000001")).toBe(1n);
    expect(rawToUsdc(10_000n)).toBe("0.010000");
    expect(rawToUsdc(50_000n)).toBe("0.050000");
    expect(rawToUsdc(1_234_567n)).toBe("1.234567");
  });
  it("rejects anything that is not a plain USDC amount", () => {
    for (const bad of ["", "-1", "1e3", "0.0000001", "abc", "1.", ".5"]) expect(() => usdcToRaw(bad)).toThrow();
  });
});

describe("parseMaxCalls", () => {
  it("defaults to 5 and accepts whole numbers up to the absolute ceiling", () => {
    expect(parseMaxCalls(undefined)).toBe(DEFAULT_MAX_CALLS);
    expect(parseMaxCalls("")).toBe(5);
    expect(parseMaxCalls("3")).toBe(3);
    expect(parseMaxCalls(String(ABSOLUTE_MAX_CALLS))).toBe(ABSOLUTE_MAX_CALLS);
  });
  it("refuses zero, negatives, fractions, text and anything above the ceiling", () => {
    for (const bad of ["0", "-2", "1.5", "five", String(ABSOLUTE_MAX_CALLS + 1), "1000"]) expect(() => parseMaxCalls(bad)).toThrow(/--max-calls/);
  });
});

describe("SpendGuard", () => {
  it("allows exactly maxCalls payments at the limit price and then refuses", () => {
    const g = new SpendGuard(5, "0.01", USDC_TYPE);
    expect(g.ceiling).toBe("0.050000");
    for (let i = 0; i < 5; i++) g.approve(challenge());
    expect(g.calls).toBe(5);
    expect(g.spent).toBe("0.050000");
    expect(g.callsLeft).toBe(0);
    expect(() => g.approve(challenge())).toThrow(SpendCapExceeded);
    expect(g.calls).toBe(5);
  });
  it("refuses a price above the per-call limit and counts nothing for a refused payment", () => {
    const g = new SpendGuard(5, "0.01", USDC_TYPE);
    expect(() => g.approve(challenge("0.02"))).toThrow(/above the limit/);
    expect(() => g.approve(challenge("1"))).toThrow(SpendCapExceeded);
    expect(g.calls).toBe(0);
    expect(g.spent).toBe("0.000000");
  });
  it("accepts a lower price and tracks the real spend", () => {
    const g = new SpendGuard(5, "0.01", USDC_TYPE);
    g.approve(challenge("0.005"));
    g.approve(challenge("0.01"));
    expect(g.spent).toBe("0.015000");
  });
  it("refuses another coin and an unreadable amount", () => {
    const g = new SpendGuard(5, "0.01", USDC_TYPE);
    expect(() => g.approve(challenge("0.01", "0x2::sui::SUI"))).toThrow(/expected USDC/);
    expect(() => g.approve(challenge("lots"))).toThrow(/unreadable/);
    expect(g.calls).toBe(0);
  });
  it("cannot be built with a cap outside 1 to 25", () => {
    expect(() => new SpendGuard(0, "0.01", USDC_TYPE)).toThrow();
    expect(() => new SpendGuard(26, "0.01", USDC_TYPE)).toThrow();
  });
});

describe("planWallets", () => {
  const w = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
  it("keeps valid distinct wallets up to the cap and reports the rest", () => {
    const plan = planWallets([w(1), w(2).toUpperCase().replace("0X", "0x"), w(1), "nope", w(3), w(4)], 3);
    expect(plan.wallets).toEqual([w(1), w(2), w(3)]);
    expect(plan.skipped).toEqual([w(4)]);
    expect(plan.invalid).toEqual(["nope"]);
  });
});
