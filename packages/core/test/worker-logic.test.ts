import { describe, expect, it } from "vitest";
import {
  gradeForecast, leagueOf, needsNewVersion, outcomeRecord, shortAddress, skillVerdict, summariseGrades,
  verdictKey, verdictRecord, walletRecord, yesWon, selectCandidates, candlePoints, type VerdictData,
} from "../src/index.js";

describe("skillVerdict", () => {
  it("calls skill, negative edge, too early and luck", () => {
    expect(skillVerdict({ z: 2.4, n: 212 })).toBe("skill");
    expect(skillVerdict({ z: -2.1, n: 80 })).toBe("negative edge");
    expect(skillVerdict({ z: 3, n: 12 })).toBe("too early");
    expect(skillVerdict({ z: 0.7, n: 200 })).toBe("luck / unproven");
    expect(skillVerdict({ z: 1.99, n: 30 })).toBe("luck / unproven");
    expect(skillVerdict({ z: 2, n: 30 })).toBe("skill");
  });
});

describe("leagueOf", () => {
  it("takes the first slug segment", () => {
    expect(leagueOf("nba-okc-cle-2026-11-02-total-227pt5")).toBe("nba");
    expect(leagueOf("CS2-mglz-hero-2026-11-02")).toBe("cs2");
    expect(leagueOf("")).toBe("other");
  });
});

describe("walletRecord", () => {
  const row = { wallet: "0xabcdef0123456789abcdef0123456789abcdef01", league: "nba", edge: 0.061, se: 0.025, z: 2.44, n: 212, effN: 150, updatedAt: "2026-11-03T00:00:00.000Z" };
  it("writes the summary format from the build plan and a lowercase key", () => {
    const r = walletRecord(row, 1);
    expect(r.kind).toBe("wallet");
    expect(r.key).toBe("0xabcdef0123456789abcdef0123456789abcdef01:nba");
    expect(r.summary).toBe("Wallet 0xabcdef…ef01 has +6.1 pts edge on NBA over 212 bets (z 2.4): likely skill");
    expect(r.data.verdict).toBe("skill");
  });
  it("shortens addresses", () => {
    expect(shortAddress("0xabcdef0123456789abcdef0123456789abcdef01")).toBe("0xabcdef…ef01");
    expect(shortAddress("0x12")).toBe("0x12");
  });
  it("re-versions only when the edge moves by 0.5 pts", () => {
    expect(needsNewVersion(undefined, 0.01)).toBe(true);
    expect(needsNewVersion(0.061, 0.0655)).toBe(false);
    expect(needsNewVersion(0.061, 0.0661)).toBe(true);
    expect(needsNewVersion(0.061, 0.0555)).toBe(true);
  });
});

const verdict: VerdictData = {
  marketId: "0xmarket", eventSlug: "cs2-mglz-hero-2026-11-03", league: "cs2", question: "TheMongolz vs Heroic", yesOutcome: "THEMONGOLZ",
  move: { from: 0.4, to: 0.52, startTs: 1_000_000, endTs: 1_900_000 }, label: "sharp-led", sharpShare: 0.72, opposition: null,
  forecast: 0.56, priceAtVerdict: 0.52, trades: 120, wallets: 14, topWallets: [],
  checkpoint: { sequence: "123456", digest: null, timestamp: "2026-11-03T10:00:00.000Z" }, sealedAt: "2026-11-03T10:00:01.000Z",
};

describe("verdict and outcome records", () => {
  it("builds a keyed, readable verdict", () => {
    const r = verdictRecord(verdict);
    expect(r.key).toBe(verdictKey("0xmarket", 1_900_000));
    expect(r.key).toBe("0xmarket:1900");
    expect(r.summary).toContain("is sharp-led");
    expect(r.summary).toContain("THEMONGOLZ 40% to 52%");
    expect(r.summary).toContain("forecast 56%");
    expect(JSON.parse(JSON.stringify(r.data))).toEqual(verdict);
  });
  it("builds an outcome that says who was closer", () => {
    const grade = gradeForecast(0.56, 0.52, 1);
    const r = outcomeRecord({
      verdictKey: "0xmarket:1900", marketId: "0xmarket", question: "TheMongolz vs Heroic", label: "sharp-led", resolution: "THEMONGOLZ",
      yesWon: 1, forecast: 0.56, priceAtVerdict: 0.52, grade, gradedAt: "2026-11-04T00:00:00.000Z",
    });
    expect(r.summary).toContain("beat the market price 52%");
    expect(r.key).toBe("0xmarket:1900");
  });
});

describe("grading", () => {
  it("scores forecast against market price by Brier", () => {
    const g = gradeForecast(0.7, 0.5, 1);
    expect(g.forecastBrier).toBeCloseTo(0.09);
    expect(g.marketBrier).toBeCloseTo(0.25);
    expect(g.gain).toBeCloseTo(0.16);
    expect(gradeForecast(0.3, 0.5, 1).gain).toBeLessThan(0);
  });
  it("summarises per label with an all row last", () => {
    const rows = [
      { label: "sharp-led", grade: gradeForecast(0.7, 0.5, 1) },
      { label: "sharp-led", grade: gradeForecast(0.6, 0.5, 0) },
      { label: "noise", grade: gradeForecast(0.5, 0.5, 1) },
    ];
    const s = summariseGrades(rows);
    expect(s.map((x) => x.label)).toEqual(["noise", "sharp-led", "all"]);
    const sharp = s.find((x) => x.label === "sharp-led")!;
    expect(sharp.n).toBe(2);
    expect(sharp.winRate).toBe(0.5);
    expect(s.at(-1)!.n).toBe(3);
  });
  it("maps a resolution name to YES (first outcome) or NO, and skips 50-50", () => {
    expect(yesWon("themongolz", ["THEMONGOLZ", "HEROIC"])).toBe(1);
    expect(yesWon("HEROIC", ["THEMONGOLZ", "HEROIC"])).toBe(0);
    expect(yesWon("NO", ["YES", "NO"])).toBe(0);
    expect(yesWon("50-50", ["YES", "NO"])).toBeNull();
  });
});

describe("discovery", () => {
  const now = Date.parse("2026-11-03T10:00:00Z");
  const ev = (id: string, slug: string, hoursFromNow: number, volume: number, markets: string[], status = "active") => ({
    id, title: slug, status, totalVolume: volume, markets, closeTime: new Date(now + hoursFromNow * 3_600_000).toISOString(), source: { platformId: slug },
  });
  it("keeps live games, drops stale and side events, ranks by volume and caps markets", () => {
    const events = [
      ev("1", "ucl-vil-psg-2026-11-03", 10, 350_000, ["a", "b", "c"]),
      ev("2", "ucl-vil-psg-2026-11-03-more-markets", 10, 999_999, ["x"]),
      ev("3", "afg-lka-2026-03-13", -4000, 5_000_000, ["old"]),
      ev("4", "cs2-mglz-hero-2026-11-02", 4, 1_264_957, Array.from({ length: 24 }, (_, i) => `m${i}`)),
      ev("5", "nba-okc-cle-2026-11-03", 20, 10, ["n1"], "closed"),
      ev("1", "ucl-vil-psg-2026-11-03", 10, 350_000, ["a", "b", "c"]),
    ];
    const picked = selectCandidates(events, { now, maxMarkets: 4 });
    expect(picked.map((c) => c.marketId)).toEqual(["m0", "m1", "a", "b"]);
    expect(picked[0]).toMatchObject({ league: "cs2", slug: "cs2-mglz-hero-2026-11-02" });
    expect(selectCandidates(events, { now, maxMarkets: 50 }).map((c) => c.marketId)).toEqual(["m0", "m1", "a", "b", "c"]);
  });
  it("turns candles into ordered price points", () => {
    const pts = candlePoints([
      { timestamp: "2026-11-03T10:05:00Z", close: 0.5 },
      { timestamp: "2026-11-03T10:00:00Z", close: 0.4 },
    ]);
    expect(pts.map((p) => p.close)).toEqual([0.4, 0.5]);
  });
});
