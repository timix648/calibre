import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ResolutionLike, WalletEdgeRow } from "../packages/core/src/index.js";
import {
  cacheFile, cachedResolution, cachedWalletHistory, gammaTimes, indexRows, mergeRows, resolutionFromGammaRow, takersOfReplayLine, uniqueWallets,
  type CachedTrade,
} from "./export-index-lib";
import { gammaMarketTimes } from "./public-source";

const A = "0x" + "a".repeat(40), B = "0x" + "b".repeat(40);
let root: string, dirs: { publicDir: string; tatumDir: string };

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "calibre-index-"));
  dirs = { publicDir: join(root, "public"), tatumDir: join(root, "tatum") };
  await mkdir(dirs.publicDir, { recursive: true });
  await mkdir(dirs.tatumDir, { recursive: true });
});
afterEach(() => rm(root, { recursive: true, force: true }));

const put = (dir: string, key: string, body: unknown) => writeFile(cacheFile(dir, key), JSON.stringify(body));
const v2 = (n: number, wallet = A) =>
  Array.from({ length: n }, (_, i) => ({
    proxy_wallet: wallet, side: "BUY", condition_id: `0xc${i}`, size: 10, price: 0.5, timestamp: 1_700_000_000 + i,
    title: "t", slug: "nba-a-b-2026-10-01", event_slug: "nba-a-b-2026-10-01", outcome: "Yes", outcome_index: 0,
  }));

describe("cacheFile", () => {
  it("uses the sha1 of the key, like public-source.ts", () => {
    expect(cacheFile(".cache/public", "gamma:0xabc")).toBe(`.cache/public/${createHash("sha1").update("gamma:0xabc").digest("hex")}.json`);
  });
});

describe("cachedWalletHistory", () => {
  it("returns null when nothing is cached for the wallet", async () => {
    expect(await cachedWalletHistory(dirs.publicDir, A)).toBeNull();
  });
  it("follows the cursor chain of v2 pages", async () => {
    await put(dirs.publicDir, `v2trades:${A}:`, { data: v2(500), pagination: { has_more: true, next_cursor: "c1" } });
    await put(dirs.publicDir, `v2trades:${A}:c1`, { data: v2(120), pagination: { has_more: false } });
    const h = await cachedWalletHistory(dirs.publicDir, A, 1000);
    expect(h?.trades).toHaveLength(620);
    expect(h?.partial).toBe(false);
    expect(h?.trades[0]).toMatchObject({ proxyWallet: A, conditionId: "0xc0", eventSlug: "nba-a-b-2026-10-01", outcomeIndex: 0 });
  });
  it("flags a missing later page as partial and stops at max", async () => {
    await put(dirs.publicDir, `v2trades:${B}:`, { data: v2(500, B), pagination: { has_more: true, next_cursor: "c1" } });
    expect(await cachedWalletHistory(dirs.publicDir, B, 1000)).toMatchObject({ partial: true });
    expect((await cachedWalletHistory(dirs.publicDir, B, 100))?.trades).toHaveLength(100);
    expect((await cachedWalletHistory(dirs.publicDir, B, 100))?.partial).toBe(false);
  });
  it("reads v1 pages by offset", async () => {
    await put(dirs.publicDir, `trades:${A}:0`, [{ conditionId: "0x1" }]);
    expect((await cachedWalletHistory(dirs.publicDir, A))?.trades).toHaveLength(1);
  });
});

const gammaRow = (extra: object = {}) => ({
  outcomes: JSON.stringify(["Lakers", "Celtics"]), outcomePrices: JSON.stringify(["1", "0"]),
  gameStartTime: "2026-10-15 02:30:00+00", endDate: "2026-10-16T00:00:00Z", closedTime: "2026-10-15 05:00:00+00", ...extra,
});

describe("resolutions from cache", () => {
  it("matches public-source on the times and winner of a Gamma row", () => {
    const row = gammaRow();
    expect(gammaTimes(row)).toEqual(gammaMarketTimes(row));
    expect(resolutionFromGammaRow(row)).toMatchObject({ outcome: "Lakers", outcomes: ["Lakers", "Celtics"] });
    expect(resolutionFromGammaRow(gammaRow({ outcomePrices: JSON.stringify(["0.5", "0.5"]) }))).toBeNull();
    expect(resolutionFromGammaRow(undefined)).toBeNull();
  });
  it("prefers a resolved Tatum market and takes the start time from the Gamma row", async () => {
    await put(dirs.tatumDir, "/markets/0x1", { body: { data: { resolution: { outcome: "Celtics" }, outcomes: [{ name: "Lakers" }, { name: "Celtics" }], closeTime: "2026-10-15T06:00:00Z" } } });
    await put(dirs.publicDir, "gamma:0x1", [gammaRow({ closedTime: undefined, endDate: undefined })]);
    const r = await cachedResolution(dirs, "0x1");
    expect(r).toMatchObject({ outcome: "Celtics", outcomes: ["Lakers", "Celtics"], startTs: Date.parse("2026-10-15T02:30:00Z"), closeTs: Date.parse("2026-10-15T06:00:00Z") });
  });
  it("falls back to Gamma, treats an empty or missing entry as unresolved", async () => {
    await put(dirs.publicDir, "gamma:0x2", [gammaRow()]);
    await put(dirs.publicDir, "gamma:0x3", []);
    expect((await cachedResolution(dirs, "0x2"))?.outcome).toBe("Lakers");
    expect(await cachedResolution(dirs, "0x3")).toBeNull();
    expect(await cachedResolution(dirs, "0x4")).toBeNull();
  });
});

describe("indexRows", () => {
  const at = "2026-11-04T10:00:00.000Z";
  const trades = (): CachedTrade[] =>
    Array.from({ length: 40 }, (_, i) => ({
      proxyWallet: A, side: "BUY" as const, conditionId: `0xm${i}`, size: 10, price: 0.4, timestamp: 1_760_000_000 + i * 3600,
      title: "t", slug: "nba-lal-bos-2026-10-01", eventSlug: "nba-lal-bos-2026-10-01", outcome: "Lakers", outcomeIndex: 0,
    }));
  const resolutions = (): Map<string, ResolutionLike | null> => new Map(Array.from({ length: 40 }, (_, i) => [`0xm${i}`, { outcome: i % 2 ? "Lakers" : "Celtics", outcomes: ["Lakers", "Celtics"], startTs: (1_760_000_000 + i * 3600) * 1000 + 3_600_000 }]));

  it("gives one lower-cased row per league with the index fields", () => {
    const rows = indexRows(A.toUpperCase().replace("0X", "0x"), trades(), resolutions(), at);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    for (const r of rows) {
      expect(Object.keys(r).sort()).toEqual(["edge", "effN", "league", "n", "se", "updatedAt", "wallet", "z"]);
      expect(r.wallet).toBe(A);
      expect(r.updatedAt).toBe(at);
    }
    expect(rows.find((r) => r.league === "nba")?.n).toBe(40);
  });
  it("is identical to the worker's walletRows", async () => {
    const { walletRows } = await import("../apps/worker/src/lib/wallet-index.js");
    expect(indexRows(A, trades(), resolutions(), at)).toEqual(walletRows(A, trades(), resolutions(), at));
  });
  it("gives no rows for unresolved markets", () => {
    expect(indexRows(A, trades(), new Map(), at)).toEqual([]);
  });
});

describe("mergeRows", () => {
  const row = (wallet: string, league: string, updatedAt: string, z: number): WalletEdgeRow => ({ wallet, league, edge: 0.01, se: 0.02, z, n: 50, effN: 40, updatedAt });
  it("keeps the newer row per wallet and league and adds the rest, sorted by z", () => {
    const existing = [row(A, "nba", "2026-11-03T12:00:00Z", 1), row(A, "mlb", "2026-11-05T00:00:00Z", 5), row(B, "nba", "2026-11-03T12:00:00Z", -3)];
    const incoming = [row(A, "nba", "2026-11-04T10:00:00Z", 2), row(A, "mlb", "2026-11-04T10:00:00Z", -9), row(B, "nfl", "2026-11-04T10:00:00Z", 0.5)];
    const merged = mergeRows(existing, incoming);
    expect(merged).toHaveLength(4);
    expect(merged.find((r) => r.wallet === A && r.league === "nba")?.z).toBe(2);
    expect(merged.find((r) => r.wallet === A && r.league === "mlb")?.z).toBe(5);
    expect(merged.find((r) => r.wallet === B && r.league === "nfl")).toBeDefined();
    expect(merged.map((r) => r.z)).toEqual([5, 2, 0.5, -3]);
  });
  it("lets the incoming row win a tie and treats wallet case as the same wallet", () => {
    const merged = mergeRows([row(A.toUpperCase().replace("0X", "0x"), "nba", "2026-11-04T10:00:00Z", 1)], [row(A, "nba", "2026-11-04T10:00:00Z", 7)]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.z).toBe(7);
  });
  it("does not modify its inputs", () => {
    const existing = [row(A, "nba", "2026-11-03T12:00:00Z", 1)];
    mergeRows(existing, [row(A, "nba", "2026-11-04T10:00:00Z", 2)]);
    expect(existing[0]!.z).toBe(1);
  });
});

describe("wallet sources", () => {
  it("collects, lower-cases and de-duplicates valid wallets only", () => {
    expect(uniqueWallets([A, "nope"], [A.toUpperCase().replace("0X", "0x"), B])).toEqual([A, B]);
  });
  it("reads takers from a replay line and ignores bad lines", () => {
    expect(takersOfReplayLine(JSON.stringify({ market: "m", takers: [{ wallet: A, usd: 5 }, { usd: 1 }] }))).toEqual([A]);
    expect(takersOfReplayLine("{broken")).toEqual([]);
    expect(takersOfReplayLine(JSON.stringify({ market: "m" }))).toEqual([]);
  });
});
