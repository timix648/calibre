import { afterEach, describe, expect, it, vi } from "vitest";
import { RateLimiter, TtlCache, auditAddress, fetchResolutions, gammaResolution, isAddress } from "../src/index.js";

describe("gammaResolution", () => {
  const row = {
    conditionId: "0xabc", outcomes: JSON.stringify(["Magic", "Wizards"]), outcomePrices: JSON.stringify(["0", "1"]),
    gameStartTime: "2026-11-02 00:00:00+00", endDate: "2026-11-02T04:00:00Z", closedTime: "2026-11-02 03:00:00+00",
  };

  it("reads the winning outcome and the start and close times", () => {
    const r = gammaResolution(row)!;
    expect(r.outcome).toBe("Wizards");
    expect(r.outcomes).toEqual(["Magic", "Wizards"]);
    expect(r.startTs).toBe(Date.parse("2026-11-02T00:00:00Z"));
    expect(r.closeTs).toBe(Date.parse("2026-11-02T03:00:00Z"));
  });

  it("is null for a split or malformed market", () => {
    expect(gammaResolution({ ...row, outcomePrices: JSON.stringify(["0.5", "0.5"]) })).toBeNull();
    expect(gammaResolution({ ...row, outcomes: "not json" })).toBeNull();
    expect(gammaResolution({})).toBeNull();
  });
});

describe("isAddress", () => {
  it("accepts 40 hex digits behind 0x only", () => {
    expect(isAddress("0x684baa57c338c2549aec0aa3f034f695d72a8409")).toBe(true);
    expect(isAddress("0x684baa57c338c2549aec0aa3f034f695d72a840")).toBe(false);
    expect(isAddress("684baa57c338c2549aec0aa3f034f695d72a8409")).toBe(false);
    expect(isAddress("0xzz4baa57c338c2549aec0aa3f034f695d72a8409")).toBe(false);
  });
});

describe("TtlCache", () => {
  it("expires entries and evicts the oldest when full", () => {
    const c = new TtlCache<number>(1000, 2);
    c.set("a", 1, 0);
    expect(c.get("a", 999)).toBe(1);
    expect(c.get("a", 1000)).toBeUndefined();
    c.set("a", 1, 0); c.set("b", 2, 0); c.set("c", 3, 10);
    expect(c.get("c", 20)).toBe(3);
  });
});

describe("RateLimiter", () => {
  it("allows the limit then reports seconds to wait, per key, and resets after the window", () => {
    const r = new RateLimiter(2, 60_000);
    expect([r.hit("ip", 0), r.hit("ip", 1000), r.hit("ip", 2000)]).toEqual([0, 0, 58]);
    expect(r.hit("other", 2000)).toBe(0);
    expect(r.hit("ip", 60_000)).toBe(0);
  });
});

describe("auditAddress with a stubbed Polymarket", () => {
  afterEach(() => vi.unstubAllGlobals());
  const addr = "0x684baa57c338c2549aec0aa3f034f695d72a8409";
  const start = Date.parse("2026-11-02T00:00:00Z");

  it("fetches trades and resolutions and returns an audit", async () => {
    const trades = Array.from({ length: 40 }, (_, i) => ({
      proxy_wallet: addr, side: "BUY", condition_id: `0xC${i}`, size: 10, price: 0.5, timestamp: start / 1000 - 3600,
      title: "t", slug: "nba-aaa-bbb-2026-11-02", event_slug: "nba-aaa-bbb-2026-11-02", outcome: "A", outcome_index: 0, name: "tester",
    }));
    const markets = trades.map((t, i) => ({
      conditionId: t.condition_id.toLowerCase(), outcomes: JSON.stringify(["A", "B"]),
      outcomePrices: JSON.stringify(i % 2 ? ["0", "1"] : ["1", "0"]), gameStartTime: "2026-11-02 00:00:00+00",
    }));
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const body = String(url).includes("/v2/trades") ? { data: trades, pagination: { has_more: false } } : markets;
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const r = await auditAddress(addr);
    expect(r.name).toBe("tester");
    expect(r.tradesFetched).toBe(40);
    expect(r.truncated).toBe(false);
    expect(r.audit.pregame.n).toBe(40);
    expect(r.audit.pregame.edge).toBeCloseTo(0, 6);
    expect(r.audit.verdict).toBe("no proven edge (consistent with luck)");
  });

  it("reports an empty wallet without calling Gamma", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], pagination: { has_more: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await auditAddress(addr);
    expect(r.tradesFetched).toBe(0);
    expect(r.audit.verdict).toBe("too early");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-address and surfaces an upstream failure", async () => {
    await expect(auditAddress("hello")).rejects.toThrow("not a wallet address");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    await expect(fetchResolutions(["0x1"])).rejects.toThrow("404");
  });
});
