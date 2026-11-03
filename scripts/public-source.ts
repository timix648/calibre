// Free Polymarket public data for the one-off research backtest, so it costs no Tatum credits.
// The live product uses Tatum's Prediction Markets API; this is only for the skill-vs-luck study.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import type { WalletTrade } from "../packages/chain/src/index.js";
import type { ResolutionLike } from "../packages/core/src/index.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIR = ".cache/public";

async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const file = `${DIR}/${createHash("sha1").update(key).digest("hex")}.json`;
  try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { /* miss */ }
  const body = await fetcher();
  await mkdir(DIR, { recursive: true });
  await writeFile(file, JSON.stringify(body));
  return body;
}

async function getJson(url: string): Promise<any> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) { await sleep(150); return res.json(); }
    if (res.status === 429 || res.status >= 500) { await sleep(1000 * 2 ** attempt); continue; }
    throw new Error(`${res.status} ${url}`);
  }
  throw new Error("rate limited: " + url);
}

async function cacheHit<T>(key: string): Promise<T | null> {
  try { return JSON.parse(await readFile(`${DIR}/${createHash("sha1").update(key).digest("hex")}.json`, "utf8")) as T; } catch { return null; }
}

interface V2Trade {
  proxy_wallet: string; side: "BUY" | "SELL"; condition_id: string; size: number; price: number; timestamp: number;
  title: string; slug: string; event_slug: string; outcome: string; outcome_index: number;
}
const fromV2 = (t: V2Trade): WalletTrade => ({
  proxyWallet: t.proxy_wallet, side: t.side, conditionId: t.condition_id, size: t.size, price: t.price,
  timestamp: t.timestamp, title: t.title, slug: t.slug, eventSlug: t.event_slug, outcome: t.outcome, outcomeIndex: t.outcome_index,
});

/** Up to `max` most recent trades of a wallet (same fields as Tatum's /wallets/{addr}/trades). */
export async function publicWalletHistory(address: string, max = 1000): Promise<WalletTrade[]> {
  // Pages fetched before Polymarket retired Data API v1 (3 Nov 2026) are reused from cache.
  const out: WalletTrade[] = [];
  if (await cacheHit(`trades:${address}:0`)) {
    for (let offset = 0; offset < max; offset += 500) {
      const page = await cacheHit<WalletTrade[]>(`trades:${address}:${offset}`);
      if (!page) break;
      out.push(...page);
      if (page.length < 500) break;
    }
    return out.slice(0, max);
  }
  let cursor = "";
  while (out.length < max) {
    const page = await cached(`v2trades:${address}:${cursor}`, () =>
      getJson(`https://data-api.polymarket.com/v2/trades?user=${address}&limit=500${cursor ? `&cursor=${cursor}` : ""}`)) as
      { data: V2Trade[]; pagination: { has_more: boolean; next_cursor?: string } };
    out.push(...page.data.map(fromV2));
    if (!page.pagination.has_more || !page.pagination.next_cursor) break;
    cursor = page.pagination.next_cursor;
  }
  return out.slice(0, max);
}

/** Wallets that traded a market (most recent fills). */
export async function publicMarketTakers(conditionId: string, limit = 500): Promise<string[]> {
  const v1 = await cacheHit<{ proxyWallet: string }[]>(`mtrades:${conditionId}:${limit}`);
  if (v1) return v1.map((t) => t.proxyWallet);
  const page = await cached(`v2mtrades:${conditionId}:${limit}`, () =>
    getJson(`https://data-api.polymarket.com/v2/trades?market=${conditionId}&limit=${limit}`)) as { data?: V2Trade[] };
  return (page.data ?? []).map((t) => t.proxy_wallet);
}

/** Look up many closed markets per request and cache each one (an empty list means not closed yet). */
export async function prefetchResolutions(conditionIds: string[]): Promise<void> {
  const missing: string[] = [];
  for (const id of new Set(conditionIds)) {
    try { await readFile(`${DIR}/${createHash("sha1").update(`gamma:${id}`).digest("hex")}.json`); } catch { missing.push(id); }
  }
  await mkdir(DIR, { recursive: true });
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    const rows = (await getJson(`https://gamma-api.polymarket.com/markets?closed=true&limit=100&${batch.map((id) => `condition_ids=${id}`).join("&")}`)) as any[];
    const byId = new Map(rows.map((r) => [String(r.conditionId).toLowerCase(), r]));
    for (const id of batch) {
      const row = byId.get(id.toLowerCase());
      await writeFile(`${DIR}/${createHash("sha1").update(`gamma:${id}`).digest("hex")}.json`, JSON.stringify(row ? [row] : []));
    }
  }
}

/** Resolution of a closed market from Gamma: the outcome whose final price is 1. Null if not cleanly resolved. */
export async function publicResolution(conditionId: string): Promise<ResolutionLike | null> {
  const rows = await cached(`gamma:${conditionId}`, () =>
    getJson(`https://gamma-api.polymarket.com/markets?condition_ids=${conditionId}&closed=true`)) as any[];
  const m = rows?.[0];
  if (!m?.outcomes || !m?.outcomePrices) return null;
  const outcomes: string[] = JSON.parse(m.outcomes);
  const prices: number[] = JSON.parse(m.outcomePrices).map(Number);
  const winner = prices.findIndex((p) => p >= 0.99);
  return winner >= 0 ? { outcome: outcomes[winner]!, outcomes } : null;
}
