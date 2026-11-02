import { describe, expect, it } from "vitest";
import { aggregateFlows, judgeMove, tradeView, type FlowTrade } from "../src/index.js";

const t = (taker: string, side: "yes" | "no", direction: "buy" | "sell", price: number, size: number): FlowTrade => ({ taker, side, direction, price, size });
const sharp = { bss: 0.08, effN: 60 };
const skills: Record<string, { bss: number; effN: number }> = { S1: sharp, S2: sharp, D: { bss: -0.1, effN: 80 } };
const skillOf = (w: string) => skills[w];

describe("tradeView", () => {
  it("buying YES and selling NO are bullish; buying NO is bearish", () => {
    expect(tradeView(t("a", "yes", "buy", 0.4, 100)).yesUsd).toBe(40);
    expect(tradeView(t("a", "no", "sell", 0.6, 100)).yesUsd).toBe(60);
    const bear = tradeView(t("a", "no", "buy", 0.6, 100));
    expect(bear.yesUsd).toBe(-60);
    expect(bear.pYes).toBeLessThan(0.4); // NO at 0.60 = YES at 0.40, and buying NO believes YES is lower
  });
});

describe("aggregateFlows", () => {
  it("nets each wallet's trades and attaches shrunk skill weight", () => {
    const flows = aggregateFlows([t("S1", "yes", "buy", 0.5, 100), t("S1", "yes", "sell", 0.55, 20), t("X", "yes", "buy", 0.5, 10)], skillOf);
    const s1 = flows.find((f) => f.wallet === "S1")!;
    expect(s1.netYesUsd).toBeCloseTo(50 - 11);
    expect(s1.weight).toBeGreaterThan(0);
    expect(flows.find((f) => f.wallet === "X")!.weight).toBe(0);
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
