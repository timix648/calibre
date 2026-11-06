import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PredictionApiError, PredictionClient } from "../src/prediction.js";

type Reply = { status: number; body: unknown };

function fakeFetch(replies: Reply[]) {
  const calls: { url: string; key: string | null }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, key: new Headers(init?.headers).get("x-api-key") });
    const r = replies.shift() ?? { status: 200, body: { data: [] } };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const noSleep = async () => {};
let dir: string | undefined;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = undefined; });

describe("PredictionClient", () => {
  it("sends the API key and builds query strings, skipping undefined params", async () => {
    const f = fakeFetch([{ status: 200, body: { data: [], pagination: {} } }]);
    const c = new PredictionClient("k1", { fetch: f.fn, sleep: noSleep });
    await c.events({ platform: "polymarket", status: "closed", category: "SPORTS", sort: "newest", cursor: undefined });
    expect(f.calls[0]!.key).toBe("k1");
    expect(f.calls[0]!.url).toBe("https://api.tatum.io/v4/data/prediction/events?platform=polymarket&status=closed&category=SPORTS&sort=newest");
  });

  it("asks price history for the midpoint feed, because Tatum's candlesticks default is empty for Polymarket", async () => {
    const f = fakeFetch([{ status: 200, body: { data: { candles: [{ timestamp: "2026-11-06T09:30:00.000Z", close: 0.555 }] } } }]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    const candles = await c.marketHistory("0xabc", { interval: "5m", start: "2026-11-06T09:00:00Z", end: "2026-11-06T11:00:00Z" });
    expect(candles).toHaveLength(1);
    expect(f.calls[0]!.url).toContain("source=midpoint");
  });

  it("lets a caller ask for the candlesticks feed explicitly", async () => {
    const f = fakeFetch([{ status: 200, body: { data: { candles: [] } } }]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    await c.marketHistory("0xabc", { interval: "1h", start: "a", end: "b", source: "candlesticks" });
    expect(f.calls[0]!.url).toContain("source=candlesticks");
  });

  it("retries 429 and 5xx, then succeeds", async () => {
    const f = fakeFetch([{ status: 429, body: {} }, { status: 503, body: {} }, { status: 200, body: { data: [{ rank: 1 }] } }]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    expect(await c.topTraders({ category: "SPORTS" })).toEqual([{ rank: 1 }]);
    expect(f.calls).toHaveLength(3);
  });

  it("does not retry client errors", async () => {
    const f = fakeFetch([{ status: 400, body: { message: "bad" } }]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    await expect(c.walletTrades("0xabc")).rejects.toBeInstanceOf(PredictionApiError);
    expect(f.calls).toHaveLength(1);
  });

  it("caches resolved markets on disk and serves them without a request", async () => {
    dir = await mkdtemp(join(tmpdir(), "calibre-cache-"));
    const resolved = { data: { id: "m1", resolution: { outcome: "NO", resolvedAt: "2026-01-01", source: "UMA" } } };
    const f = fakeFetch([{ status: 200, body: resolved }]);
    const c1 = new PredictionClient("k", { fetch: f.fn, sleep: noSleep, cacheDir: dir });
    expect((await c1.market("m1")).resolution?.outcome).toBe("NO");
    const c2 = new PredictionClient("k", { fetch: f.fn, sleep: noSleep, cacheDir: dir });
    expect((await c2.market("m1")).resolution?.outcome).toBe("NO");
    expect(f.calls).toHaveLength(1);
  });

  it("pages wallet history by offset until a short page", async () => {
    const page = (n: number) => ({ status: 200, body: { data: Array.from({ length: n }, (_, i) => ({ conditionId: "c" + i })) } });
    const f = fakeFetch([page(100), page(30)]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    expect(await c.walletHistory("0xw", 500)).toHaveLength(130);
    expect(f.calls[1]!.url).toContain("offset=100");
  });

  it("stops before exceeding the call budget and persists the count across clients", async () => {
    dir = await mkdtemp(join(tmpdir(), "calibre-budget-"));
    const file = join(dir, "calls.json");
    const f = fakeFetch([]);
    const c1 = new PredictionClient("k", { fetch: f.fn, sleep: noSleep, callBudget: 2, budgetFile: file });
    await c1.walletTrades("a");
    await c1.walletTrades("b");
    await expect(c1.walletTrades("c")).rejects.toThrow(/budget exhausted/);
    const c2 = new PredictionClient("k", { fetch: f.fn, sleep: noSleep, callBudget: 2, budgetFile: file });
    await expect(c2.walletTrades("d")).rejects.toThrow(/budget exhausted/);
    expect(f.calls).toHaveLength(2);
  });

  it("spaces requests to respect the rate limit", async () => {
    const waits: number[] = [];
    const f = fakeFetch([]);
    const c = new PredictionClient("k", { fetch: f.fn, rps: 2, sleep: async (ms) => { waits.push(ms); } });
    await Promise.all([c.walletTrades("a"), c.walletTrades("b"), c.walletTrades("c")]);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...waits)).toBeGreaterThan(400);
  });
  it("fetches an open market once, then keeps the resolved copy for good", async () => {
    dir = await mkdtemp(join(tmpdir(), "calibre-market-"));
    const open = { data: { id: "m2", resolution: null } };
    const resolved = { data: { id: "m2", resolution: { outcome: "YES", resolvedAt: "2026-01-01", source: "UMA" } } };
    const f = fakeFetch([{ status: 200, body: open }, { status: 200, body: resolved }]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep, cacheDir: dir });
    const now = vi.spyOn(Date, "now");
    const t0 = Date.now();
    now.mockReturnValue(t0);
    expect((await c.market("m2")).resolution).toBeNull();
    expect(f.calls).toHaveLength(1);
    now.mockReturnValue(t0 + 120_000);
    expect((await c.market("m2")).resolution?.outcome).toBe("YES");
    expect(f.calls).toHaveLength(2);
    now.mockReturnValue(t0 + 600_000);
    expect((await c.market("m2")).resolution?.outcome).toBe("YES");
    expect(f.calls).toHaveLength(2);
    now.mockRestore();
  });

  it("pages market trades back with the cursor and stops at the cutoff", async () => {
    const trade = (ts: string) => ({ tradeId: ts, timestamp: ts });
    const hour = (h: number) => new Date(Date.UTC(2026, 10, 3, h)).toISOString();
    const pageOf = (hours: number[], cursor?: string) => ({
      status: 200,
      body: { data: hours.map((h) => trade(hour(h))), pagination: cursor ? { cursor } : {} },
    });
    const full = Array.from({ length: 100 }, () => 12);
    const f = fakeFetch([pageOf(full, "c1"), pageOf([...Array.from({ length: 60 }, () => 11), ...Array.from({ length: 40 }, () => 9)], "c2")]);
    const c = new PredictionClient("k", { fetch: f.fn, sleep: noSleep });
    const trades = await c.marketTradesSince("m1", Date.UTC(2026, 10, 3, 10), 5);
    expect(trades).toHaveLength(160);
    expect(f.calls).toHaveLength(2);
    expect(f.calls[1]!.url).toContain("cursor=c1");
  });
});
