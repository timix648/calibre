import { describe, expect, it } from "vitest";
import type { VerdictData } from "../../../packages/core/src/index.js";
import {
  MAX_SEAL_ATTEMPTS, decideSeal, queueSeal, recordSealFailure, removeSeal, sealDelayMinutes, withTimeout, type PendingSeal,
} from "../src/lib/pending-seals.js";

const data = (marketId = "0xabc"): VerdictData => ({
  marketId, eventSlug: "nba-lal-bos-2026-11-04", league: "nba", question: "Lakers win?", yesOutcome: "Lakers",
  move: { from: 0.42, to: 0.84, startTs: 1_000, endTs: 2_000 }, label: "contested", sharpShare: 0, opposition: null, forecast: 0.8,
  priceAtVerdict: 0.84, trades: 10, wallets: 4, topWallets: [], checkpoint: { sequence: "123", digest: "d", timestamp: "t" },
  sealedAt: "2026-11-04T10:00:00.000Z",
});

describe("decideSeal", () => {
  it("retries an open market that still has attempts left", () => {
    expect(decideSeal({ attempts: 1 }, "open")).toBe("retry");
    expect(decideSeal({ attempts: MAX_SEAL_ATTEMPTS - 1 }, "open")).toBe("retry");
  });
  it("drops a resolved market, however many attempts are left or used", () => {
    expect(decideSeal({ attempts: 1 }, "resolved")).toBe("drop-resolved");
    expect(decideSeal({ attempts: MAX_SEAL_ATTEMPTS }, "resolved")).toBe("drop-resolved");
  });
  it("gives up after the bounded number of attempts", () => {
    expect(decideSeal({ attempts: MAX_SEAL_ATTEMPTS }, "open")).toBe("give-up");
    expect(decideSeal({ attempts: 3 }, "open", 3)).toBe("give-up");
  });
  it("waits, and never seals, when it cannot tell whether the market resolved", () => {
    expect(decideSeal({ attempts: 2 }, "unknown")).toBe("wait");
  });
});

describe("the pending list", () => {
  it("queues a failed verdict with its original data and counts the first write as attempt 1", () => {
    const now = Date.parse("2026-11-04T10:05:00Z");
    const list = queueSeal([], "k1", data(), "write timed out", now);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ key: "k1", attempts: 1, lastError: "write timed out", lastAttemptAt: "2026-11-04T10:05:00.000Z" });
    expect(list[0]!.data.sealedAt).toBe("2026-11-04T10:00:00.000Z");
    expect(list[0]!.data.checkpoint.sequence).toBe("123");
    expect(list[0]!.data.move.from).toBe(0.42);
  });
  it("never queues the same move twice", () => {
    const once = queueSeal([], "k1", data(), "a", 1);
    expect(queueSeal(once, "k1", data(), "b", 2)).toHaveLength(1);
    expect(queueSeal(once, "k2", data("0xdef"), "b", 2)).toHaveLength(2);
  });
  it("counts failures up to the bound and then the decision is to give up", () => {
    let list: PendingSeal[] = queueSeal([], "k1", data(), "e", 0);
    for (let i = 0; i < MAX_SEAL_ATTEMPTS - 1; i++) list = recordSealFailure(list, "k1", `e${i}`, i + 1);
    expect(list[0]!.attempts).toBe(MAX_SEAL_ATTEMPTS);
    expect(decideSeal(list[0]!, "open")).toBe("give-up");
  });
  it("leaves other entries alone and removes by key", () => {
    const list = queueSeal(queueSeal([], "k1", data(), "e", 0), "k2", data("0xdef"), "e", 0);
    expect(recordSealFailure(list, "k1", "x", 5).find((p) => p.key === "k2")!.attempts).toBe(1);
    expect(removeSeal(list, "k1").map((p) => p.key)).toEqual(["k2"]);
  });
});

describe("sealDelayMinutes", () => {
  it("is the gap between judging and sealing in minutes, to a tenth", () => {
    expect(sealDelayMinutes("2026-11-04T10:00:00Z", "2026-11-04T10:00:30Z")).toBe(0.5);
    expect(sealDelayMinutes("2026-11-04T10:00:00Z", "2026-11-04T10:40:00Z")).toBe(40);
  });
  it("is never negative", () => {
    expect(sealDelayMinutes("2026-11-04T10:00:00Z", "2026-11-04T09:59:00Z")).toBe(0);
  });
});

describe("withTimeout", () => {
  it("passes a result through", async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it("rejects a write that hangs", async () => {
    await expect(withTimeout(new Promise(() => {}), 10, "Walrus write")).rejects.toThrow("Walrus write timed out");
  });
  it("passes a failure through", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 50)).rejects.toThrow("boom");
  });
});
