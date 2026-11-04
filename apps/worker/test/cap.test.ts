import { describe, expect, it } from "vitest";
import { HourlyCapReached, TatumCap, recentlyJudged } from "../src/lib/cap.js";

const HOUR = 3_600_000;

describe("TatumCap", () => {
  it("allows calls until the hourly cap and then refuses, whatever the run mode", () => {
    const cap = new TatumCap(18);
    const now = 10 * HOUR;
    cap.record(17, now - 1000);
    expect(() => cap.require(now)).not.toThrow();
    cap.record(1, now);
    expect(() => cap.require(now)).toThrow(HourlyCapReached);
    expect(cap.room(now)).toBe(false);
  });

  it("keeps a reserve for judging when discovery and history ask with one", () => {
    const cap = new TatumCap(18, Array<number>(7).fill(HOUR));
    expect(cap.room(HOUR + 1, 10)).toBe(true);
    cap.record(1, HOUR + 2);
    expect(cap.room(HOUR + 3, 10)).toBe(false);
    expect(cap.room(HOUR + 3, 0)).toBe(true);
  });

  it("frees the allowance as credits age out of the hour", () => {
    const cap = new TatumCap(5);
    cap.record(5, 0);
    expect(cap.room(HOUR - 1)).toBe(false);
    expect(cap.room(HOUR)).toBe(true);
    expect(cap.record(1, HOUR)).toHaveLength(1);
  });

  it("a dry run that judges one market after another stops at the cap", () => {
    // Each judgement costs 3 calls (market, price, trades). A cap of 7 allows the first two judgements and refuses the third.
    const cap = new TatumCap(7);
    let judged = 0;
    for (let i = 0; i < 5; i++) {
      try {
        for (let call = 0; call < 3; call++) { cap.require(1000); cap.record(1, 1000); }
        judged++;
      } catch (e) {
        expect(e).toBeInstanceOf(HourlyCapReached);
        break;
      }
    }
    expect(judged).toBe(2);
    expect(cap.entries.length).toBe(7);
  });
});

describe("recentlyJudged", () => {
  it("counts a dry run's own judgements, so a dry loop does not judge a market on every pass", () => {
    const t = 100 * HOUR;
    const dry = new Map([["0xm", t]]);
    expect(recentlyJudged({}, dry, "0xm", t + 1000, HOUR)).toBe(true);
    expect(recentlyJudged({}, dry, "0xother", t + 1000, HOUR)).toBe(false);
    expect(recentlyJudged({}, dry, "0xm", t + HOUR, HOUR)).toBe(false);
  });
  it("still honours sealed verdicts", () => {
    expect(recentlyJudged({ "0xm": 100 * HOUR }, new Map(), "0xm", 100 * HOUR + 900, HOUR)).toBe(true);
  });
});
