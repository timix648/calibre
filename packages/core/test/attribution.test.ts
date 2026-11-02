import { describe, expect, it } from "vitest";
import { aggregateFlows, judgeMove, priceEdge, shrunkEdge, tradeView, type FlowTrade } from "../src/index.js";

const t = (taker: string, side: "yes" | "no", direction: "buy" | "sell", price: number, size: number): FlowTrade => ({ taker, side, direction, price, size });
const sharp = { edge: 0.06, effN: 120 };
const skills: Record<string, { edge: number; effN: number }> = { S1: sharp, S2: sharp, D: { edge: -0.05, effN: 200 } };
const skillOf = (w: string) => skills[w];

describe("priceEdge", () => {
  it("is zero for a wallet that wins exactly as often as the prices implied", () => {
    const picks = [0, 1, 2, 3].map((i) => ({ pMkt: 0.5, y: (i % 2) as 0 | 1, ts: i }));
    expect(priceEdge(picks).edge).toBeCloseTo(0);
  });

  it("measures moderate real edge that a fixed-shift Brier score would punish", () => {
    // Buys at 0.50 and wins 55 of 100: a genuine 5-point edge.
    const picks = Array.from({ length: 100 }, (_, i) => ({ pMkt: 0.5, y: (i < 55 ? 1 : 0) as 0 | 1, ts: 0 }));
    const e = priceEdge(picks);
    expect(e.edge).toBeCloseTo(0.05);
    expect(e.se).toBeCloseTo(0.05);
    expect(e.z).toBeCloseTo(1);
  });

  it("shrinks small samples toward zero", () => {
    expect(shrunkEdge({ edge: 0.1, effN: 5 })).toBeLessThan(shrunkEdge({ edge: 0.1, effN: 200 }));
    expect(priceEdge([]).n).toBe(0);
  });
});

describe("tradeView", () => {
  it("buying YES and selling NO are bullish; buying NO is bearish at the YES-equivalent price", () => {
    expect(tradeView(t("a", "yes", "buy", 0.4, 100))).toEqual({ yesUsd: 40, yesPrice: 0.4 });
    expect(tradeView(t("a", "no", "sell", 0.6, 100)).yesUsd).toBe(60);
    const bear = tradeView(t("a", "no", "buy", 0.6, 100));
    expect(bear.yesUsd).toBe(-60);
    expect(bear.yesPrice).toBeCloseTo(0.4);
  });
});

describe("aggregateFlows", () => {
  it("nets each wallet's trades and shifts skilled wallets' views by their edge", () => {
    const flows = aggregateFlows([t("S1", "yes", "buy", 0.5, 100), t("S1", "yes", "sell", 0.55, 20), t("X", "yes", "buy", 0.5, 10), t("D", "yes", "buy", 0.5, 10)], skillOf);
    const s1 = flows.find((f) => f.wallet === "S1")!;
    expect(s1.netYesUsd).toBeCloseTo(50 - 11);
    expect(s1.edge).toBeGreaterThan(0);
    expect(s1.pYes).toBeGreaterThan(s1.avgYesPrice);
    expect(flows.find((f) => f.wallet === "X")!.edge).toBe(0);
    expect(flows.find((f) => f.wallet === "D")!.edge).toBe(0); // negative edge is not trusted, not inverted
  });
});

describe("judgeMove", () => {
  it("labels a move driven by skilled wallets as sharp-led and leans the forecast with it", () => {
    const flows = aggregateFlows([t("S1", "yes", "buy", 0.55, 1000), t("S2", "yes", "buy", 0.58, 800), t("X", "yes", "buy", 0.6, 200)], skillOf);
    const v = judgeMove(0.5, 0.6, flows);
    expect(v.label).toBe("sharp-led");
    expect(v.sharpShare).toBeGreaterThan(0.8);
    expect(v.forecast).toBeGreaterThan(0.6);
  });

  it("labels a move by unknown or unskilled wallets as noise and leaves the price alone", () => {
    const flows = aggregateFlows([t("X", "yes", "buy", 0.6, 1000), t("D", "yes", "buy", 0.6, 500)], skillOf);
    const v = judgeMove(0.5, 0.6, flows);
    expect(v.label).toBe("noise");
    expect(v.forecast).toBeCloseTo(0.6);
  });

  it("labels a move as contested when skilled money bets against it", () => {
    const flows = aggregateFlows([t("S1", "yes", "buy", 0.6, 500), t("S2", "no", "buy", 0.4, 600), t("X", "yes", "buy", 0.6, 2000)], skillOf);
    expect(judgeMove(0.5, 0.6, flows).label).toBe("contested");
  });
});
