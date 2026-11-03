import { describe, expect, it } from "vitest";
import {
  BREAKER_HOLD_MS, POLITICS, aggregateFlows, breakerOpen, callsInLastHour, categoryFromTags, isMidtermEvent, latestMove,
  priceSeriesFromTrades, publicTradeToFlow, publicTradesToFlows, selectMidtermCandidates, tradesToPicks, tripBreaker,
  verdictRecord, type EventLike, type PublicTradeLike, type VerdictData,
} from "../src/index.js";

const fill = (o: Partial<PublicTradeLike> = {}): PublicTradeLike => ({
  proxy_wallet: "0xABC", side: "BUY", outcome_index: 0, price: 0.6, size: 10, timestamp: 1_793_704_585, ...o,
});

describe("publicTradeToFlow", () => {
  it("maps outcome 0 to yes, outcome 1 to no, and BUY/SELL to buy/sell", () => {
    expect(publicTradeToFlow(fill())).toEqual({ taker: "0xabc", side: "yes", direction: "buy", price: 0.6, size: 10, ts: 1_793_704_585_000 });
    expect(publicTradeToFlow(fill({ outcome_index: 1, side: "SELL" }))).toMatchObject({ side: "no", direction: "sell" });
  });
  it("drops fills it cannot place on a yes/no market", () => {
    expect(publicTradeToFlow(fill({ outcome_index: 2 }))).toBeNull();
    expect(publicTradeToFlow(fill({ price: 1 }))).toBeNull();
    expect(publicTradeToFlow(fill({ size: 0 }))).toBeNull();
    expect(publicTradesToFlows([fill(), fill({ outcome_index: 3 })])).toHaveLength(1);
  });
  it("feeds the attribution code: buying NO is a bearish bet", () => {
    const flows = aggregateFlows(publicTradesToFlows([fill({ outcome_index: 1, price: 0.3, size: 100 })]), () => undefined);
    expect(flows[0]!.netYesUsd).toBeCloseTo(-30);
    expect(flows[0]!.avgYesPrice).toBeCloseTo(0.7);
  });
});

describe("priceSeriesFromTrades", () => {
  const FIVE = 5 * 60_000;
  const t0 = Math.floor(1_793_704_000_000 / FIVE) * FIVE;
  const at = (ms: number, o: Partial<PublicTradeLike> = {}) => publicTradeToFlow(fill({ timestamp: (t0 + ms) / 1000, ...o }))!;
  it("closes each 5-minute bucket on its last fill, oldest first, and converts NO fills to YES prices", () => {
    const series = priceSeriesFromTrades([
      at(4 * 60_000, { price: 0.62 }), at(60_000, { price: 0.6 }),
      at(FIVE + 30_000, { outcome_index: 1, price: 0.35 }),
    ]);
    expect(series.map((p) => p.ts)).toEqual([t0, t0 + FIVE]);
    expect(series[0]!.close).toBeCloseTo(0.62);
    expect(series[1]!.close).toBeCloseTo(0.65);
  });
  it("leaves empty buckets out and returns nothing for no fills", () => {
    expect(priceSeriesFromTrades([at(0), at(3 * FIVE)])).toHaveLength(2);
    expect(priceSeriesFromTrades([])).toEqual([]);
  });
  it("produces a series that latestMove can read", () => {
    const series = priceSeriesFromTrades([at(0, { price: 0.5 }), at(FIVE, { price: 0.53 }), at(2 * FIVE, { price: 0.58 })]);
    const move = latestMove(series, { minJump: 0.05 });
    expect(move?.from).toBeCloseTo(0.5);
    expect(move?.to).toBeCloseTo(0.58);
  });
});

describe("circuit breaker", () => {
  it("stays open for an hour and then lets the market through again", () => {
    const state = tripBreaker({}, "0xm", 1_000);
    expect(breakerOpen(state, "0xm", 1_000 + BREAKER_HOLD_MS - 1)).toBe(true);
    expect(breakerOpen(state, "0xm", 1_000 + BREAKER_HOLD_MS)).toBe(false);
    expect(breakerOpen(state, "0xother", 1_000)).toBe(false);
  });
  it("forgets expired entries when another market trips", () => {
    const state = tripBreaker(tripBreaker({}, "0xold", 0), "0xnew", BREAKER_HOLD_MS + 5);
    expect(Object.keys(state)).toEqual(["0xnew"]);
  });
  it("counts calls made in the last hour", () => {
    expect(callsInLastHour([0, 1_000, 3_599_999, 3_600_000], 3_600_000)).toBe(3);
  });
});

describe("politics discovery", () => {
  const now = Date.parse("2026-11-03T12:00:00Z");
  const ev = (id: string, o: Partial<EventLike> = {}): EventLike => ({
    id, title: `Event ${id}`, status: "active", closeTime: "2026-11-04T05:00:00Z", totalVolume: 1, markets: [`${id}-a`, `${id}-b`, `${id}-c`],
    tags: ["politics", "midterms"], source: { platformId: `slug-${id}` }, ...o,
  });
  it("keeps active midterm events closing within the window", () => {
    expect(isMidtermEvent(ev("1"), now)).toBe(true);
    expect(isMidtermEvent(ev("2", { tags: ["politics", "pop-culture"] }), now)).toBe(false);
    expect(isMidtermEvent(ev("3", { closeTime: "2028-11-08T00:00:00Z" }), now)).toBe(false);
    expect(isMidtermEvent(ev("4", { closeTime: "2026-10-01T00:00:00Z" }), now)).toBe(false);
    expect(isMidtermEvent(ev("5", { status: "closed" }), now)).toBe(false);
    expect(isMidtermEvent(ev("6", { markets: [] }), now)).toBe(false);
  });
  it("takes the first markets of the busiest events, files them under politics, and respects the cap", () => {
    const c = selectMidtermCandidates([ev("small", { totalVolume: 5 }), ev("big", { totalVolume: 50 }), ev("big"), ev("other", { tags: ["sports"] })], { now, maxMarkets: 3 });
    expect(c.map((x) => x.marketId)).toEqual(["big-a", "big-b", "small-a"]);
    expect(c.every((x) => x.league === POLITICS)).toBe(true);
    expect(c[0]!.slug).toBe("slug-big");
  });
  it("names the politics category from event tags", () => {
    expect(categoryFromTags(["united-states", "Politics"])).toBe("politics");
    expect(categoryFromTags(["sports", "nba"])).toBeNull();
    expect(categoryFromTags(undefined)).toBeNull();
  });
});

describe("tradesToPicks with a category hook", () => {
  const trade = (conditionId: string, slug: string) => ({ conditionId, side: "BUY" as const, price: 0.4, size: 10, timestamp: 1_700_000_000, outcome: "Yes", slug });
  const resolutions = new Map([["0xa", { outcome: "Yes" }], ["0xb", { outcome: "Yes" }]]);
  it("files tagged trades under the category and the rest under the slug's league", () => {
    const picks = tradesToPicks([trade("0xa", "will-the-democrats-win"), trade("0xb", "nba-okc-cle-2026-11-02")], resolutions, 0.25, (t) => (t.conditionId === "0xa" ? POLITICS : null));
    expect(picks.map((p) => p.league)).toEqual(["politics", "nba"]);
  });
  it("files an unknown league as other without a hook", () => {
    expect(tradesToPicks([trade("0xa", "will-the-democrats-win")], resolutions)[0]!.league).toBe("other");
  });
});

describe("verdict source label", () => {
  const base: VerdictData = {
    marketId: "0xm", eventSlug: "which-party-will-win-the-senate-in-2026", league: "politics", question: "Will the Democrats control the Senate?", yesOutcome: "YES",
    move: { from: 0.7, to: 0.76, startTs: 1, endTs: 2 }, label: "noise", sharpShare: 0.05, opposition: null, forecast: 0.76, priceAtVerdict: 0.76, trades: 40, wallets: 12, topWallets: [],
    checkpoint: { sequence: "1", digest: null, timestamp: null }, sealedAt: "2026-11-03T12:00:00.000Z",
  };
  it("says so in the summary only when the data came from the public API", () => {
    expect(verdictRecord({ ...base, source: "tatum" }).summary).not.toContain("Data:");
    expect(verdictRecord(base).summary).not.toContain("Data:");
    const pub = verdictRecord({ ...base, source: "polymarket-public", fallbackReason: "Tatum history returned no candles for an active market" });
    expect(pub.summary).toContain("Data: Polymarket public API (Tatum history returned no candles for an active market)");
    expect(pub.data.source).toBe("polymarket-public");
  });
});
