import { describe, expect, it } from "vitest";
import {
  aggregatePosition, blend, brier, brierSkill, calibrationBuckets, DAY_MS, devig, disagrees,
  equalWeightBlend, impliedProb, meanBrier, shrunkWeight, type ScoredPick,
} from "../src/index.js";

const day = (d: number) => d * DAY_MS;

describe("brier", () => {
  it("is 0 for a perfect forecast and 1 for a perfectly wrong one", () => {
    expect(brier(1, 1)).toBe(0);
    expect(brier(0, 1)).toBe(1);
    expect(brier(0.5, 0)).toBe(0.25);
  });
  it("averages", () => {
    expect(meanBrier([{ p: 1, y: 1 }, { p: 0, y: 1 }])).toBe(0.5);
    expect(meanBrier([])).toBeNaN();
  });
});

describe("brierSkill", () => {
  it("is positive when the source beats the market price", () => {
    const picks: ScoredPick[] = [
      { pSrc: 0.8, pMkt: 0.6, y: 1, ts: day(1) },
      { pSrc: 0.2, pMkt: 0.4, y: 0, ts: day(2) },
    ];
    const s = brierSkill(picks, { halfLifeDays: Infinity });
    expect(s.bss).toBeGreaterThan(0);
    expect(s.n).toBe(2);
    expect(s.effN).toBeCloseTo(2);
  });

  it("is negative when the source is worse than the market", () => {
    const s = brierSkill([{ pSrc: 0.3, pMkt: 0.7, y: 1, ts: 0 }], { halfLifeDays: Infinity });
    expect(s.bss).toBeLessThan(0);
  });

  it("does not reward backing favourites that the market already priced", () => {
    // Source always copies the market: raw Brier looks great, skill is zero.
    const picks: ScoredPick[] = [0.9, 0.85, 0.95].map((p, i) => ({ pSrc: p, pMkt: p, y: 1 as const, ts: day(i) }));
    expect(brierSkill(picks).bss).toBeCloseTo(0);
  });

  it("weights recent picks more under decay", () => {
    const old: ScoredPick = { pSrc: 0.9, pMkt: 0.5, y: 0, ts: day(0) };   // old bad call
    const recent: ScoredPick = { pSrc: 0.9, pMkt: 0.5, y: 1, ts: day(90) }; // recent good call
    const decayed = brierSkill([old, recent], { halfLifeDays: 14 });
    const flat = brierSkill([old, recent], { halfLifeDays: Infinity });
    expect(decayed.bss).toBeGreaterThan(flat.bss);
    expect(decayed.effN).toBeLessThan(flat.effN);
  });

  it("handles no picks", () => {
    expect(brierSkill([])).toMatchObject({ bss: 0, n: 0, effN: 0 });
  });
});

describe("shrunkWeight", () => {
  it("grows with sample size for the same skill and never goes negative", () => {
    expect(shrunkWeight({ bss: 0.1, effN: 3 })).toBeLessThan(shrunkWeight({ bss: 0.1, effN: 30 }));
    expect(shrunkWeight({ bss: -0.2, effN: 50 })).toBe(0);
    expect(shrunkWeight({ bss: 0.1, effN: 0 })).toBe(0);
  });
});

describe("blend", () => {
  it("returns the market price when all weights are zero", () => {
    expect(blend(0.6, [{ p: 0.9, w: 0 }]).p).toBeCloseTo(0.6);
  });
  it("moves toward a trusted source, more with more weight", () => {
    const low = blend(0.5, [{ p: 0.8, w: 0.1 }]).p;
    const high = blend(0.5, [{ p: 0.8, w: 0.5 }]).p;
    expect(low).toBeGreaterThan(0.5);
    expect(high).toBeGreaterThan(low);
    expect(high).toBeLessThan(0.8);
  });
  it("clamps to [0.01, 0.99] and reports contributions", () => {
    const r = blend(0.98, [{ p: 0.999, w: 1, sourceId: "a" }]);
    expect(r.p).toBeLessThanOrEqual(0.99);
    expect(r.contributions[0]).toMatchObject({ sourceId: "a" });
    expect(r.contributions[0]!.delta).toBeGreaterThan(0);
  });
  it("equal-weight baseline uses 1/N", () => {
    const r = equalWeightBlend(0.5, [{ p: 0.7 }, { p: 0.3 }]);
    expect(r.p).toBeCloseTo(0.5);
    expect(equalWeightBlend(0.4, []).p).toBeCloseTo(0.4);
  });
});

describe("positions", () => {
  it("buying YES implies a belief above the price, NO below", () => {
    expect(impliedProb("YES", 0.4)).toBeGreaterThan(0.4);
    expect(impliedProb("NO", 0.4)).toBeLessThan(0.4);
  });
  it("size-weights trades and converts NO prices to YES-equivalent", () => {
    const p = aggregatePosition([
      { side: "YES", price: 0.4, sizeUsd: 100, ts: 0 },
      { side: "NO", price: 0.6, sizeUsd: 100, ts: 0 }, // NO at 0.60 = YES at 0.40
    ]);
    expect(p).toBeCloseTo((impliedProb("YES", 0.4) + impliedProb("NO", 0.4)) / 2);
    expect(aggregatePosition([{ side: "YES", price: 0.5, sizeUsd: 0, ts: 0 }])).toBeNull();
  });
});

describe("calibration and odds", () => {
  it("buckets forecasts", () => {
    const b = calibrationBuckets([{ p: 0.05, y: 0 }, { p: 0.95, y: 1 }, { p: 1, y: 1 }], 10);
    expect(b[0]).toMatchObject({ n: 1, freq: 0 });
    expect(b[9]).toMatchObject({ n: 2, freq: 1 });
  });
  it("removes bookmaker margin", () => {
    const probs = devig([1.9, 1.9]);
    expect(probs.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(probs[0]).toBeCloseTo(0.5);
  });
  it("flags disagreement above the threshold", () => {
    expect(disagrees(0.5, 0.57)).toBe(true);
    expect(disagrees(0.5, 0.53)).toBe(false);
  });
});
