import { describe, expect, it } from "vitest";
import { classifySlug, impliedProb, onePickPerMarket, tradesToPicks, type TradeLike } from "../src/index.js";

const trade = (o: Partial<TradeLike>): TradeLike => ({
  conditionId: "m1", side: "BUY", price: 0.4, size: 100, timestamp: 1_790_000_000, outcome: "Magic",
  slug: "nba-was-orl-2026-11-02", ...o,
});

describe("classifySlug", () => {
  it.each([
    ["nba-okc-cle-2026-11-02-total-227pt5", "nba", "total"],
    ["nba-was-orl-2026-11-02-spread-home-2pt5", "nba", "spread"],
    ["nfl-sea-den-2026-10-15", "nfl", "moneyline"],
    ["epl-ars-che-2026-11-08-player-saka-anytime", "epl", "prop"],
    ["will-bitcoin-hit-150k", "other", "other"],
    ["highest-temperature-in-chongqing-on-october-31-2026-20c", "other", "other"],
  ])("%s", (slug, league, type) => {
    expect(classifySlug(slug)).toEqual({ league, marketType: type });
  });
});

describe("tradesToPicks", () => {
  const res = new Map([["m1", { outcome: "Magic" }], ["m2", { outcome: "Wizards" }], ["m3", null]]);

  it("scores a winning buy and a losing buy against the resolved outcome", () => {
    const picks = tradesToPicks([trade({}), trade({ conditionId: "m2" })], res);
    expect(picks.map((p) => p.y)).toEqual([1, 0]);
    expect(picks[0]).toMatchObject({ pMkt: 0.4, league: "nba", marketType: "moneyline" });
    expect(picks[0]!.pSrc).toBeCloseTo(impliedProb("YES", 0.4));
  });

  it("scores a sell as a bet on the other side at 1 - price", () => {
    // Sold Magic at 0.40 and Magic won: a losing bet on "not Magic" at 0.60.
    const [p] = tradesToPicks([trade({ side: "SELL" })], res);
    expect(p).toMatchObject({ pMkt: 0.6, y: 0 });
    const [q] = tradesToPicks([trade({ side: "SELL", conditionId: "m2" })], res);
    expect(q).toMatchObject({ pMkt: 0.6, y: 1 });
  });

  it("skips unresolved markets and impossible prices", () => {
    expect(tradesToPicks([trade({ conditionId: "m3" }), trade({ price: 1 }), trade({ size: 0 })], res)).toEqual([]);
  });

  it("skips resolutions that match none of the market's outcomes (50-50)", () => {
    const split = new Map([["m1", { outcome: "50-50", outcomes: ["Magic", "Wizards"] }]]);
    expect(tradesToPicks([trade({})], split)).toEqual([]);
  });
});

describe("onePickPerMarket", () => {
  it("merges fills of the same bet, size-weighted, keeping the earliest time", () => {
    const res = new Map([["m1", { outcome: "Magic" }]]);
    const picks = tradesToPicks([
      trade({ price: 0.4, size: 100, timestamp: 2 }),
      trade({ price: 0.5, size: 100, timestamp: 1 }),
    ], res);
    const [merged] = onePickPerMarket(picks);
    expect(onePickPerMarket(picks)).toHaveLength(1);
    expect(merged!.ts).toBe(1000);
    expect(merged!.pMkt).toBeCloseTo((0.4 * 40 + 0.5 * 50) / 90);
  });
});
