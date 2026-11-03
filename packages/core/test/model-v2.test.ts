import { describe, expect, it } from "vitest";
import {
  KNOWN_LEAGUES, MAX_FORECAST_SHIFT, MAX_WALLET_EDGE, MODEL_VERSION, OTHER, PRE_CLOSE_BUFFER_MS, aggregateFlows, inPlayCutoff,
  judgeMove, leagueOf, parseGammaTime, retiredWalletRows, tradesToPicks, verdictRecord, type FlowTrade, type TradeLike, type VerdictData,
} from "../src/index.js";

const HOUR = 3_600_000;
const START = Date.parse("2026-11-02T20:00:00Z");
const trade = (o: Partial<TradeLike> = {}): TradeLike => ({
  conditionId: "m1", side: "BUY", price: 0.4, size: 100, timestamp: (START - 2 * HOUR) / 1000, outcome: "Magic",
  slug: "nba-was-orl-2026-11-02", ...o,
});
const at = (ms: number) => ({ timestamp: ms / 1000 });

describe("in-play trades are not forecasts", () => {
  const withStart = new Map([["m1", { outcome: "Magic", startTs: START, closeTs: START + 4 * HOUR }]]);

  it("keeps trades placed before the game starts and drops those at or after the start", () => {
    const picks = tradesToPicks([trade(at(START - HOUR)), trade(at(START)), trade(at(START + 20 * 60_000))], withStart);
    expect(picks).toHaveLength(1);
    expect(picks[0]!.ts).toBe(START - HOUR);
  });

  it("uses the start time even when the market closes much later", () => {
    const late = new Map([["m1", { outcome: "Magic", startTs: START, closeTs: START + 7 * 24 * HOUR }]]);
    expect(tradesToPicks([trade(at(START + HOUR))], late)).toEqual([]);
  });

  it("without a start time, drops the last three hours before the close", () => {
    const close = START + 10 * HOUR;
    const noStart = new Map([["m1", { outcome: "Magic", closeTs: close }]]);
    expect(inPlayCutoff({ closeTs: close })).toBe(close - PRE_CLOSE_BUFFER_MS);
    const picks = tradesToPicks([trade(at(close - 4 * HOUR)), trade(at(close - 2 * HOUR)), trade(at(close - 10_000))], noStart);
    expect(picks.map((p) => p.ts)).toEqual([close - 4 * HOUR]);
  });

  it("scores everything when neither time is known", () => {
    const none = new Map([["m1", { outcome: "Magic" }]]);
    expect(tradesToPicks([trade(at(START + HOUR))], none)).toHaveLength(1);
  });

  it("drops fills at 0.97 and above or 0.03 and below, where the outcome was already known", () => {
    const res = new Map([["m1", { outcome: "Magic" }]]);
    const picks = tradesToPicks([0.02, 0.03, 0.04, 0.5, 0.96, 0.97, 0.99].map((price) => trade({ price })), res);
    expect(picks.map((p) => p.pMkt)).toEqual([0.04, 0.5, 0.96]);
  });
});

describe("parseGammaTime", () => {
  it("reads both Gamma timestamp styles", () => {
    expect(parseGammaTime("2026-10-15 02:30:00+00")).toBe(Date.parse("2026-10-15T02:30:00Z"));
    expect(parseGammaTime("2026-10-14T14:14:12Z")).toBe(Date.parse("2026-10-14T14:14:12Z"));
    expect(parseGammaTime("2026-10-31 04:49:36.729038+00")).toBe(Date.parse("2026-10-31T04:49:36.729Z"));
    expect(parseGammaTime(undefined)).toBeUndefined();
    expect(parseGammaTime("")).toBeUndefined();
    expect(parseGammaTime("soon")).toBeUndefined();
  });
});

describe("league whitelist", () => {
  it("files known leagues under their prefix and everything else under other", () => {
    expect(leagueOf("nba-okc-cle-2026-11-02")).toBe("nba");
    expect(leagueOf("cs2-faze-fal2-2026-11-03")).toBe("cs2");
    expect(leagueOf("highest-temperature-in-chongqing-on-october-31-2026-20c")).toBe(OTHER);
    expect(leagueOf("will-openai-have-the-second-highest-openrouter-market-share")).toBe(OTHER);
    expect(leagueOf("btc-updown-5m-1793098200")).toBe(OTHER);
    expect(leagueOf("2026-balance-of-power-other-131")).toBe(OTHER);
    expect(leagueOf("")).toBe(OTHER);
  });

  it("counts ambiguous prefixes as leagues only on a dated game slug", () => {
    expect(leagueOf("col-ata-paf-2026-10-15-paf")).toBe("col");
    expect(leagueOf("col-bogota-mayor-election")).toBe(OTHER);
    expect(leagueOf("aus-per-ade-2026-11-01-per")).toBe("aus");
    expect(leagueOf("chi-hen-bgu-2026-10-24-total-2pt5")).toBe("chi");
  });

  it("keeps the curated list free of non-sports words", () => {
    for (const bad of ["highest", "lowest", "will", "btc", "eth", "elon", "trump", "us", "iran", "2026", "bitcoin"]) expect(KNOWN_LEAGUES).not.toContain(bad);
    for (const good of ["nba", "nfl", "mlb", "nhl", "wnba", "cfb", "cbb", "epl", "ucl", "uel", "mls", "atp", "wta", "cs2", "lol", "val", "dota2", "ufc"]) expect(KNOWN_LEAGUES).toContain(good);
  });

  it("files a trade in an unknown league as other in picks", () => {
    const res = new Map([["m1", { outcome: "Yes" }]]);
    const [p] = tradesToPicks([trade({ outcome: "Yes", slug: "highest-temperature-in-chongqing-on-october-31-2026-20c" })], res);
    expect(p!.league).toBe(OTHER);
  });
});

const f = (taker: string, side: "yes" | "no", direction: "buy" | "sell", price: number, size: number): FlowTrade => ({ taker, side, direction, price, size });

describe("forecast model v2", () => {
  it("caps a wallet's edge at 8 points however large its history says it is", () => {
    const [flow] = aggregateFlows([f("S", "yes", "buy", 0.5, 100)], () => ({ edge: 0.41, effN: 1000 }));
    expect(flow!.edge).toBe(MAX_WALLET_EDGE);
    expect(flow!.pYes).toBeCloseTo(0.5 + MAX_WALLET_EDGE);
  });

  it("cannot be pulled far by a star wallet with a tiny share of a contested move (the 65% vs 32.5% case)", () => {
    // Price fell 50% -> 32.5%. A star wallet that bought YES earlier at 70% is about 1% of the money; the crowd sold.
    const skill = (w: string) => (w === "star" ? { edge: 0.41, effN: 1000 } : undefined);
    const flows = aggregateFlows([f("star", "yes", "buy", 0.7, 100), f("crowd1", "yes", "sell", 0.35, 5000), f("crowd2", "yes", "sell", 0.33, 4000)], skill);
    const v = judgeMove(0.5, 0.325, flows);
    expect(v.sharpShare).toBe(0);
    expect(Math.abs(v.forecast - 0.325)).toBeLessThan(0.02);
  });

  it("moves a contested, low-sharp-share move by at most a few points even with several skilled wallets", () => {
    const skill = (w: string) => (w.startsWith("s") ? { edge: 0.3, effN: 500 } : undefined);
    const trades = [
      ...Array.from({ length: 5 }, (_, i) => f(`s${i}`, "yes", "buy", 0.7, 30)),
      ...Array.from({ length: 20 }, (_, i) => f(`c${i}`, "yes", "sell", 0.33, 1000)),
    ];
    const v = judgeMove(0.5, 0.325, aggregateFlows(trades, skill));
    expect(v.label).toBe("contested");
    expect(v.sharpShare).toBeLessThan(0.05);
    expect(Math.abs(v.forecast - 0.325)).toBeLessThan(0.04);
  });

  it("weights wallets by their share of total flow, not of skilled flow", () => {
    const skill = (w: string) => (w === "s" ? { edge: 0.08, effN: 1000 } : undefined);
    const alone = judgeMove(0.5, 0.6, aggregateFlows([f("s", "yes", "buy", 0.6, 100)], skill));
    const crowded = judgeMove(0.5, 0.6, aggregateFlows([f("s", "yes", "buy", 0.6, 100), f("x", "yes", "buy", 0.6, 1900)], skill));
    expect(alone.forecast - 0.6).toBeGreaterThan(0.01);
    expect(crowded.forecast - 0.6).toBeLessThan((alone.forecast - 0.6) / 10 + 1e-9);
  });

  it("never lets the forecast leave the price by more than 10 points", () => {
    const up = judgeMove(0.1, 0.2, [{ wallet: "w", netYesUsd: 1000, avgYesPrice: 0.9, edge: 0.08, pYes: 0.99 }], { alpha: 1 });
    expect(up.forecast).toBeLessThanOrEqual(0.2 + MAX_FORECAST_SHIFT + 1e-12);
    expect(up.forecast).toBeGreaterThan(0.2);
    const down = judgeMove(0.9, 0.8, [{ wallet: "w", netYesUsd: -1000, avgYesPrice: 0.1, edge: 0.08, pYes: 0.01 }], { alpha: 1 });
    expect(down.forecast).toBeGreaterThanOrEqual(0.8 - MAX_FORECAST_SHIFT - 1e-12);
  });
});

describe("verdict model version", () => {
  it("is v2 for new verdicts and carried in the sealed data", () => {
    expect(MODEL_VERSION).toBe("v2");
    const d = {
      marketId: "m", eventSlug: "e", league: "cs2", question: "Q?", yesOutcome: "A", move: { from: 0.5, to: 0.6, startTs: 1, endTs: 2 },
      label: "noise", sharpShare: 0, opposition: null, forecast: 0.6, priceAtVerdict: 0.6, trades: 1, wallets: 1, topWallets: [],
      checkpoint: { sequence: "1", digest: null, timestamp: null }, sealedAt: "x", model: MODEL_VERSION,
    } satisfies VerdictData;
    expect(verdictRecord(d).data.model).toBe("v2");
  });
});

describe("retiredWalletRows", () => {
  const scored = { sports: new Set(["0xa"]), politics: new Set(["0xb"]) };
  it("retires memory keys that lost every scorable bet, only for wallets scored in this run", () => {
    const rows = [{ wallet: "0xa", league: "nba" }];
    const keys = ["0xa:nba", "0xa:cs2", "0xa:highest", "0xb:politics", "0xc:nfl", "0xa:politics"];
    const out = retiredWalletRows(keys, rows, scored, "2026-11-03T00:00:00.000Z");
    expect(out.map((r) => `${r.wallet}:${r.league}`)).toEqual(["0xa:cs2", "0xa:highest", "0xb:politics"]);
    expect(out[0]).toMatchObject({ edge: 0, n: 0, effN: 0 });
  });
});
