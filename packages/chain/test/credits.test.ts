import { describe, expect, it } from "vitest";
import { CreditMeter, TATUM_CREDITS, budgetsFromEnv, creditCost, tatumBudgets } from "../src/credits.js";

describe("Tatum credit prices", () => {
  it("prices requests as Tatum's reference lists them", () => {
    expect(creditCost("/v4/data/prediction/markets/0xabc/history?interval=1m")).toBe(200);
    expect(creditCost("/v4/data/prediction/markets/0xabc/trades?limit=100")).toBe(100);
    expect(creditCost("/v4/data/prediction/markets/0xabc")).toBe(100);
    expect(creditCost("/v4/data/prediction/events?sort=volume_desc")).toBe(100);
    expect(creditCost("/v4/data/prediction/wallets/0xabc/value")).toBe(50);
    expect(creditCost("/v4/data/prediction/wallets/0xabc/markets-traded")).toBe(50);
    expect(creditCost("grpcQuery")).toBe(2);
    expect(TATUM_CREDITS.marketHistory).toBe(200);
  });
});

describe("CreditMeter", () => {
  it("allows requests until the daily budget is spent", () => {
    const m = new CreditMeter({ dailyBudget: 250, now: () => Date.parse("2026-11-05T10:00:00Z") });
    expect(m.allow(100)).toBe(true);
    m.spend(100);
    m.spend(100);
    expect(m.allow(100)).toBe(false);
    expect(m.allow(50)).toBe(true);
    expect(m.state()).toMatchObject({ spent: 200, requests: 2, budget: 250 });
  });

  it("pauses after a plan error and resumes when the pause ends", () => {
    let t = Date.parse("2026-11-05T10:00:00Z");
    const m = new CreditMeter({ dailyBudget: 10_000, now: () => t });
    m.pause(15 * 60_000, "HTTP 402");
    expect(m.allow(2)).toBe(false);
    t += 16 * 60_000;
    expect(m.allow(2)).toBe(true);
    expect(m.state().lastError).toBe("HTTP 402");
  });

  it("starts a fresh budget each UTC day", () => {
    let t = Date.parse("2026-11-05T23:59:00Z");
    const m = new CreditMeter({ dailyBudget: 100, now: () => t });
    m.spend(100);
    expect(m.allow(1)).toBe(false);
    t = Date.parse("2026-11-06T00:01:00Z");
    expect(m.allow(100)).toBe(true);
    expect(m.state()).toMatchObject({ day: "2026-11-06", spent: 0 });
  });
});

describe("tatumBudgets", () => {
  it("gives a free key a budget it can actually afford", () => {
    const b = tatumBudgets({ allowance: 100_000, days: 11 });
    expect(b.watcherTotal + b.siteDaily * 11).toBeLessThanOrEqual(100_000);
  });

  it("splits a half-share of the paid plan the way the cost model measured", () => {
    expect(tatumBudgets({ allowance: 2_000_000, days: 11 })).toEqual({ siteDaily: 122_000, watcherTotal: 317_746 });
  });

  it("never spends more than the allowance over the period", () => {
    for (const allowance of [50_000, 100_000, 1_000_000, 2_000_000, 4_000_000]) {
      const b = tatumBudgets({ allowance, days: 11 });
      expect(b.watcherTotal + b.siteDaily * 11).toBeLessThanOrEqual(allowance);
    }
  });

  it("prefers an explicit setting over the plan default", () => {
    expect(budgetsFromEnv({ TATUM_PLAN: "starter", TATUM_DAILY_CREDITS: "5000" }).siteDaily).toBe(5_000);
    expect(budgetsFromEnv({}).allowance).toBe(100_000);
    expect(budgetsFromEnv({ TATUM_PLAN: "starter" }).allowance).toBe(4_000_000);
  });
});
