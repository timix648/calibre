import { describe, expect, it } from "vitest";
import type { OutcomeData, VerdictData } from "@calibre/core";
import { MIN_GRADED_TO_JUDGE, buildRecord } from "../lib/record";

const verdict = (i: number, extra: Partial<VerdictData> = {}) => ({
  id: `v${i}`, key: `m${i}:${i}`, blobId: `b${i}`, walruscan: `https://walruscan.com/mainnet/blob/b${i}`,
  data: {
    marketId: `m${i}`, eventSlug: "e", league: "nba", question: `Q${i}`, yesOutcome: "Lakers",
    move: { from: 0.4, to: 0.5, startTs: 1, endTs: 2 }, label: i % 2 ? "contested" : "mixed", sharpShare: 0.1, opposition: null,
    forecast: 0.45, priceAtVerdict: 0.5, trades: 10, wallets: 5, topWallets: [], checkpoint: { sequence: "1", digest: null, timestamp: null },
    sealedAt: `2026-11-0${(i % 9) + 1}T00:00:00.000Z`, ...extra,
  } as VerdictData,
});
const outcome = (i: number, gain: number) => ({
  id: `o${i}`, key: `m${i}:${i}`, blobId: `ob${i}`, walruscan: `https://walruscan.com/mainnet/blob/ob${i}`,
  data: {
    verdictKey: `m${i}:${i}`, marketId: `m${i}`, question: `Q${i}`, label: i % 2 ? "contested" : "mixed", resolution: "Lakers", yesWon: 1,
    forecast: 0.45, priceAtVerdict: 0.5, grade: { forecastBrier: 0.3 - gain, marketBrier: 0.3, gain }, gradedAt: "2026-11-09T00:00:00.000Z",
  } as OutcomeData,
});

describe("buildRecord", () => {
  it("lists every verdict newest first and joins graded outcomes by key", () => {
    const { rows, summary } = buildRecord([verdict(1), verdict(3, { squareShare: 0.2, squareCoverage: 0.6, model: "v3" })], [outcome(3, 0.05)]);
    expect(rows.map((r) => r.id)).toEqual(["v3", "v1"]);
    expect(rows[0]).toMatchObject({ model: "v3", squareShare: 0.2, squareCoverage: 0.6 });
    expect(rows[0]!.graded).toMatchObject({ yesWon: true, gain: 0.05, outcomeWalruscan: "https://walruscan.com/mainnet/blob/ob3" });
    expect(rows[1]).toMatchObject({ model: "v1", squareShare: null, graded: null });
    expect(summary).toMatchObject({ sealed: 2, graded: 1, enough: false });
  });

  it("says there is nothing to judge with no graded verdicts", () => {
    const { summary } = buildRecord([verdict(1)], []);
    expect(summary.graded).toBe(0);
    expect(summary.forecastBrier).toBeNull();
    expect(summary.byLabel).toEqual([]);
    expect(summary.readout).toContain("none graded yet");
    expect(buildRecord([], []).summary.readout).toBe("No verdict has been sealed yet.");
  });

  it("refuses to judge on few graded verdicts, whatever the gain", () => {
    const vs = [1, 2, 3].map((i) => verdict(i));
    const { summary } = buildRecord(vs, [outcome(1, 0.2), outcome(2, 0.2), outcome(3, 0.2)]);
    expect(summary.graded).toBe(3);
    expect(summary.gain).toBeCloseTo(0.2, 12);
    expect(summary.readout).toContain("Too few graded verdicts to judge yet");
  });

  it("averages Brier scores and groups by move label", () => {
    const vs = [1, 2, 3, 4].map((i) => verdict(i));
    const { summary } = buildRecord(vs, [outcome(1, 0.1), outcome(2, -0.1), outcome(3, 0.3), outcome(4, 0.1)]);
    expect(summary.marketBrier).toBeCloseTo(0.3, 12);
    expect(summary.forecastBrier).toBeCloseTo(0.3 - 0.1, 12);
    expect(summary.winRate).toBe(0.75);
    const by = Object.fromEntries(summary.byLabel.map((g) => [g.label, g]));
    expect(by.contested!.n).toBe(2);
    expect(by.mixed!.n).toBe(2);
    expect(by.all!.n).toBe(4);
    expect(summary.gainSe).not.toBeNull();
  });

  it("judges only once there are enough graded verdicts, and only a clear gap counts", () => {
    const n = MIN_GRADED_TO_JUDGE;
    const vs = Array.from({ length: n }, (_, i) => verdict(i + 1));
    const clear = buildRecord(vs, vs.map((_, i) => outcome(i + 1, 0.1 + (i % 2) * 0.01)));
    expect(clear.summary.enough).toBe(true);
    expect(clear.summary.readout).toContain("closer to the result than the market price");
    const worse = buildRecord(vs, vs.map((_, i) => outcome(i + 1, -0.1 - (i % 2) * 0.01)));
    expect(worse.summary.readout).toContain("worse than the market price");
    const noisy = buildRecord(vs, vs.map((_, i) => outcome(i + 1, i % 2 ? 0.2 : -0.2)));
    expect(noisy.summary.readout).toContain("not clearly different");
  });
});
