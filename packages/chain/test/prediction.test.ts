import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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

  it("spaces requests to respect the rate limit", async () => {
    const waits: number[] = [];
    const f = fakeFetch([]);
    const c = new PredictionClient("k", { fetch: f.fn, rps: 2, sleep: async (ms) => { waits.push(ms); } });
    await Promise.all([c.walletTrades("a"), c.walletTrades("b"), c.walletTrades("c")]);
    expect(waits.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...waits)).toBeGreaterThan(400);
  });
});
