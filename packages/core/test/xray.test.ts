import { describe, expect, it } from "vitest";
import {
  hasHourlyRoom, squareMoneyNote, squareMoneyShare, summariseEdge, xrayLabel, xraySentence, isReliableLabel,
  type EdgeSummary, type XrayInput, type XrayLabel,
} from "../src/index.js";

const edge = (z: number, n: number, e = z * 0.03): EdgeSummary => ({
  edge: e, se: 0.03, z, n, effN: n, low: e - 0.06, high: e + 0.06, verdict: "no proven edge (consistent with luck)",
});
const input = (z: number, n: number, snipeShare = 0): XrayInput => ({
  n,
  overall: edge(z, n),
  sniping: { markets: Math.round(snipeShare * 100), resolvedMarkets: 100, share: snipeShare, edge: edge(0, 0) },
});

describe("xrayLabel", () => {
  it("calls z <= -2 over 30+ bets a proven losing record", () => {
    expect(xrayLabel(input(-2, 30))).toBe("proven losing record");
    expect(xrayLabel(input(-3.4, 400))).toBe("proven losing record");
    expect(xrayLabel(input(-1.99, 400))).toBe("no proven edge");
    expect(xrayLabel(input(-5, 29))).toBe("too early");
  });
  it("calls more than 40% sniping mostly sniping, but a proven loser stays a loser", () => {
    expect(xrayLabel(input(0.5, 80, 0.41))).toBe("mostly sniping");
    expect(xrayLabel(input(0.5, 80, 0.4))).toBe("no proven edge");
    expect(xrayLabel(input(-2.5, 80, 0.6))).toBe("proven losing record");
    expect(xrayLabel(input(0, 3, 0.9))).toBe("mostly sniping");
  });
  it("is too early under 30 scored bets", () => {
    expect(xrayLabel(input(4, 12))).toBe("too early");
    expect(xrayLabel(input(0, 0))).toBe("too early");
  });
  it("shows a positive record only at z >= 2 over 100+ bets", () => {
    expect(xrayLabel(input(2, 100))).toBe("positive record (unproven going forward)");
    expect(xrayLabel(input(2.5, 99))).toBe("no proven edge");
    expect(xrayLabel(input(1.9, 500))).toBe("no proven edge");
  });
  it("treats only the losing label as reliable", () => {
    const all: XrayLabel[] = ["proven losing record", "mostly sniping", "too early", "positive record (unproven going forward)", "no proven edge"];
    expect(all.filter(isReliableLabel)).toEqual(["proven losing record"]);
  });
});

describe("xraySentence", () => {
  it("says copying would mostly copy luck for a sniper-heavy record with no edge", () => {
    expect(xraySentence(input(0.4, 200, 0.41 - 0.2))).toContain("copying this wallet would mostly copy luck");
    expect(xraySentence(input(0.4, 200, 0.25))).toContain("25% of its resolved bets were near-certain outcomes");
  });
  it("flags the positive label as unproven going forward and never recommends fading", () => {
    const s = xraySentence(input(3, 200));
    expect(s).toContain("past winners rarely stay ahead");
    expect(xraySentence(input(-3, 200)).toLowerCase()).not.toContain("fade");
  });
  it("reports the numbers of a losing record", () => {
    const s = xraySentence({ n: 120, overall: summariseEdge({ edge: -0.05, se: 0.02, z: -2.5, n: 120, effN: 120 }), sniping: input(0, 0).sniping });
    expect(s).toContain("Over 120 bets");
    expect(s).toContain("5.0 points less often");
  });
});

describe("squareMoneyShare", () => {
  const flows = [
    { wallet: "a", netYesUsd: 600 },
    { wallet: "b", netYesUsd: 300 },
    { wallet: "c", netYesUsd: 100 },
    { wallet: "d", netYesUsd: -5000 }, // against the move, ignored
  ];
  it("shares the aligned notional from proven losers, with coverage", () => {
    const labels = new Map<string, XrayLabel | null>([["a", "proven losing record"], ["b", "no proven edge"], ["c", null]]);
    const s = squareMoneyShare(flows, labels, +1);
    expect(s.alignedUsd).toBe(1000);
    expect(s.squareUsd).toBe(600);
    expect(s.judgedUsd).toBe(900);
    expect(s.share).toBeCloseTo(0.6);
    expect(s.shareOfJudged).toBeCloseTo(600 / 900);
    expect(s.coverage).toBeCloseTo(0.9);
    expect(s.wallets).toBe(3);
    expect(s.squareWallets).toBe(1);
  });
  it("reads a down move from the negative side and accepts a plain object", () => {
    const s = squareMoneyShare(flows, { d: "proven losing record" }, -1);
    expect(s.alignedUsd).toBe(5000);
    expect(s.share).toBe(1);
    expect(s.coverage).toBe(1);
  });
  it("has zero coverage and no share of judged money when nobody was judged", () => {
    const s = squareMoneyShare(flows, new Map(), 1);
    expect(s.share).toBe(0);
    expect(s.coverage).toBe(0);
    expect(s.shareOfJudged).toBeNull();
    expect(squareMoneyShare([], new Map(), 1).coverage).toBe(0);
  });
  it("words the note as a caution, not a trade", () => {
    const note = squareMoneyNote(squareMoneyShare(flows, { a: "proven losing record", b: "no proven edge" }, 1));
    expect(note).toContain("caution signal, not a trade recommendation");
    expect(note).toContain("90%");
  });
});

describe("hasHourlyRoom", () => {
  it("counts credits in the last hour against the cap, less the reserve", () => {
    const now = 10_000_000;
    const log = [now - 4_000_000, ...Array<number>(17).fill(now - 1000)];
    expect(hasHourlyRoom(log, now, 18)).toBe(true);
    expect(hasHourlyRoom([...log, now], now, 18)).toBe(false);
    expect(hasHourlyRoom(log, now, 18, 2)).toBe(false);
  });
});
