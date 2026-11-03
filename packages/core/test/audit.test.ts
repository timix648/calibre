import { describe, expect, it } from "vitest";
import { auditVerdict, auditWallet, overallVerdict, tradesToSnipePicks, type ResolutionLike, type TradeLike } from "../src/index.js";

const START = 1_790_000_000_000;
const mk = (i: number, o: Partial<TradeLike> = {}): TradeLike => ({
  conditionId: `m${i}`, side: "BUY", price: 0.5, size: 100, timestamp: START / 1000 - 3600, outcome: "A",
  slug: "nba-aaa-bbb-2026-11-02", ...o,
});
/** A world of `count` markets whose bought outcome A won in the first `wins` of them (A resolves, B otherwise). */
function world(count: number, wins: number, o: Partial<TradeLike> = {}) {
  const trades: TradeLike[] = [];
  const res = new Map<string, ResolutionLike | null>();
  for (let i = 0; i < count; i++) {
    trades.push(mk(i, o));
    res.set(`m${i}`, { outcome: i < wins ? "A" : "B", startTs: START });
  }
  return { trades, res };
}

describe("auditVerdict", () => {
  it("is too early under 30 bets whatever the z-score", () => {
    expect(auditVerdict({ z: 5, n: 29 })).toBe("too early");
    expect(auditVerdict({ z: -5, n: 10 })).toBe("too early");
  });
  it("needs z >= 2 and 100 bets for a proven edge", () => {
    expect(auditVerdict({ z: 2, n: 100 })).toBe("proven edge");
    expect(auditVerdict({ z: 3.5, n: 99 })).toBe("no proven edge (consistent with luck)");
    expect(auditVerdict({ z: 1.99, n: 500 })).toBe("no proven edge (consistent with luck)");
  });
  it("calls z <= -2 a negative edge", () => {
    expect(auditVerdict({ z: -2, n: 30 })).toBe("negative edge");
    expect(auditVerdict({ z: -1.9, n: 300 })).toBe("no proven edge (consistent with luck)");
  });
  it("combines phases: proven beats negative beats luck beats too early", () => {
    const v = (verdict: ReturnType<typeof auditVerdict>) => ({ verdict });
    expect(overallVerdict([v("too early"), v("too early")])).toBe("too early");
    expect(overallVerdict([v("too early"), v("no proven edge (consistent with luck)")])).toBe("no proven edge (consistent with luck)");
    expect(overallVerdict([v("negative edge"), v("no proven edge (consistent with luck)")])).toBe("negative edge");
    expect(overallVerdict([v("negative edge"), v("proven edge")])).toBe("proven edge");
  });
});

describe("tradesToSnipePicks", () => {
  it("keeps only fills at 0.97 and above or 0.03 and below, in every phase", () => {
    const res = new Map([["m0", { outcome: "A", startTs: START }], ["m1", { outcome: "A", startTs: START }], ["m2", { outcome: "A", startTs: START }]]);
    const picks = tradesToSnipePicks([
      mk(0, { price: 0.98 }),
      mk(1, { price: 0.02, side: "SELL", timestamp: START / 1000 + 60 }),
      mk(2, { price: 0.5 }),
      mk(3, { price: 0.99 }),
    ], res);
    expect(picks.map((p) => p.marketId)).toEqual(["m0", "m1"]);
    expect(picks[0]).toMatchObject({ pMkt: 0.98, y: 1 });
    expect(picks[1]).toMatchObject({ pMkt: 0.98, y: 0 });
  });
});

describe("auditWallet", () => {
  it("proves an edge on a long pre-game record that beats its prices", () => {
    const { trades, res } = world(200, 140); // wins 70% at a price of 0.5
    const a = auditWallet(trades, res);
    expect(a.pregame.n).toBe(200);
    expect(a.pregame.edge).toBeCloseTo(0.2, 6);
    expect(a.pregame.z).toBeGreaterThan(5);
    expect(a.pregame.verdict).toBe("proven edge");
    expect(a.inplay.n).toBe(0);
    expect(a.inplay.verdict).toBe("too early");
    expect(a.verdict).toBe("proven edge");
    expect(a.flags).toEqual([]);
  });

  it("gives an error band of edge plus and minus two standard errors", () => {
    const { trades, res } = world(100, 60);
    const { pregame } = auditWallet(trades, res);
    expect(pregame.se).toBeCloseTo(0.05, 6);
    expect(pregame.low).toBeCloseTo(pregame.edge - 0.1, 6);
    expect(pregame.high).toBeCloseTo(pregame.edge + 0.1, 6);
  });

  it("calls a coin-flip record luck", () => {
    const { trades, res } = world(100, 50);
    const a = auditWallet(trades, res);
    expect(a.pregame.verdict).toBe("no proven edge (consistent with luck)");
    expect(a.verdict).toBe("no proven edge (consistent with luck)");
  });

  it("calls a long losing record a negative edge", () => {
    const { trades, res } = world(120, 30);
    const a = auditWallet(trades, res);
    expect(a.pregame.z).toBeLessThan(-2);
    expect(a.verdict).toBe("negative edge");
  });

  it("is too early for a short record", () => {
    const { trades, res } = world(12, 12);
    const a = auditWallet(trades, res);
    expect(a.verdict).toBe("too early");
    expect(a.pregame.n).toBe(12);
  });

  it("scores in-play bets separately from pre-game bets", () => {
    const { trades, res } = world(150, 110, { timestamp: START / 1000 + 600 });
    const a = auditWallet(trades, res);
    expect(a.pregame.n).toBe(0);
    expect(a.pregame.se).toBeNull();
    expect(a.pregame.low).toBeNull();
    expect(a.inplay.n).toBe(150);
    expect(a.inplay.verdict).toBe("proven edge");
    expect(a.verdict).toBe("proven edge");
  });

  it("flags a wallet that mostly buys decided outcomes and sets its sniping edge apart", () => {
    const res = new Map<string, ResolutionLike | null>();
    const trades: TradeLike[] = [];
    for (let i = 0; i < 70; i++) { trades.push(mk(i, { price: 0.98 })); res.set(`m${i}`, { outcome: "A", startTs: START }); }
    for (let i = 70; i < 100; i++) { trades.push(mk(i)); res.set(`m${i}`, { outcome: i % 2 ? "A" : "B", startTs: START }); }
    const a = auditWallet(trades, res);
    expect(a.sniping.markets).toBe(70);
    expect(a.sniping.resolvedMarkets).toBe(100);
    expect(a.sniping.share).toBeCloseTo(0.7);
    expect(a.sniping.edge.edge).toBeCloseTo(0.02, 6);
    expect(a.flags).toEqual(["mostly sniping"]);
    // The sniped bets do not count towards the forecasting record.
    expect(a.n).toBe(30);
    expect(a.pregame.n).toBe(30);
  });

  it("does not flag a wallet at exactly 40% sniping", () => {
    const res = new Map<string, ResolutionLike | null>();
    const trades: TradeLike[] = [];
    for (let i = 0; i < 100; i++) { trades.push(mk(i, { price: i < 40 ? 0.99 : 0.5 })); res.set(`m${i}`, { outcome: "A", startTs: START }); }
    const a = auditWallet(trades, res);
    expect(a.sniping.share).toBeCloseTo(0.4);
    expect(a.flags).toEqual([]);
  });

  it("breaks the record down by league, top five by bet count", () => {
    const leagues = ["nba", "nfl", "mlb", "nhl", "epl", "atp", "wta"];
    const res = new Map<string, ResolutionLike | null>();
    const trades: TradeLike[] = [];
    let id = 0;
    leagues.forEach((lg, li) => {
      for (let j = 0; j < 20 - li; j++, id++) {
        trades.push(mk(id, { slug: `${lg}-aaa-bbb-2026-11-02` }));
        res.set(`m${id}`, { outcome: j % 2 ? "A" : "B", startTs: START });
      }
    });
    const a = auditWallet(trades, res);
    expect(a.leagues.map((l) => l.league)).toEqual(["nba", "nfl", "mlb", "nhl", "epl"]);
    expect(a.leagues[0]).toMatchObject({ n: 20 });
    expect(a.leagues[0]!.verdict).toBe("too early");
  });

  it("ignores unresolved markets and returns an empty audit for no trades", () => {
    const empty = auditWallet([], new Map());
    expect(empty).toMatchObject({ n: 0, trades: 0, verdict: "too early", flags: [] });
    expect(empty.sniping.share).toBe(0);
    expect(JSON.parse(JSON.stringify(empty)).pregame.se).toBeNull();
    const a = auditWallet([mk(0)], new Map([["m0", null]]));
    expect(a.n).toBe(0);
    expect(a.tradesInResolvedMarkets).toBe(0);
  });
});
