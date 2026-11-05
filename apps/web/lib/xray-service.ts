import {
  PublicApiError, RateLimiter, TtlCache, buildMarketXray, isAddress, marketRefKey, parseMarketRef, resolveProfileHandle, toWalletXray,
  type MarketRef, type MarketXray, type WalletXray,
} from "@calibre/public-data";
import { anchor, tatumMarketFills, tatumWalletSnapshot } from "./tatum";
import { getAudit, runWalletAudit } from "./wallet-service";

const CACHE_MS = 10 * 60_000;
/** A partial result is kept only briefly: the audits that were still running finish in the cache, so a retry is fast. */
const PARTIAL_MS = 45_000;
/** Market X-rays take a budget of about 25 s. */
export const MARKET_BUDGET_MS = 25_000;

const complete = new TtlCache<MarketXray>(CACHE_MS);
const partial = new TtlCache<MarketXray>(PARTIAL_MS);
const inflight = new Map<string, Promise<MarketXray>>();
/** Uncached market X-rays per client: each reads up to four pages of fills plus up to six wallet audits. */
const limiter = new RateLimiter(6, 60_000);
/** Username lookups per client. */
const handleLimiter = new RateLimiter(20, 60_000);

export type WalletXrayResponse =
  | { ok: true; cached: boolean; result: WalletXray }
  | { ok: false; status: number; code: string; error: string; retryAfter?: number };

export async function runWalletXray(address: string, clientKey: string): Promise<WalletXrayResponse> {
  const res = await runWalletAudit(address, clientKey);
  if (!res.ok) return res;
  // The record comes from Polymarket's full trade history; Tatum adds its live view of the wallet and the checkpoint stamp.
  const [stamp, tatum] = await Promise.all([anchor(), tatumWalletSnapshot(address)]);
  return { ok: true, cached: res.cached, result: { ...toWalletXray(res.result), anchor: stamp, tatum } };
}

export type MarketXrayResponse =
  | { ok: true; cached: boolean; result: MarketXray }
  | { ok: false; status: number; code: "bad_ref" | "not_found" | "rate_limited" | "upstream"; error: string; retryAfter?: number };

/** Builds the reference from the route's `[ref]` segment and an optional `market` query value (a market slug inside an event). */
export function refFromRequest(refParam: string, marketParam?: string | null): MarketRef | null {
  const ref = parseMarketRef(refParam);
  if (!ref) return null;
  if (ref.kind === "slug" && !ref.marketSlug && marketParam) {
    const m = parseMarketRef(marketParam);
    if (m?.kind === "slug") return { kind: "slug", slug: ref.slug, marketSlug: m.slug };
  }
  return ref;
}

export async function runMarketXray(ref: MarketRef | null, clientKey: string): Promise<MarketXrayResponse> {
  if (!ref) {
    return { ok: false, status: 400, code: "bad_ref", error: "That is not a Polymarket event or market. Use a polymarket.com event link, a market slug, or a condition id (0x and 64 hex digits)." };
  }
  const key = marketRefKey(ref);
  const hit = complete.get(key) ?? partial.get(key);
  if (hit) return { ok: true, cached: true, result: { ...hit, anchor: await anchor() } };

  let pending = inflight.get(key);
  if (!pending) {
    const wait = limiter.hit(clientKey);
    if (wait > 0) {
      return { ok: false, status: 429, code: "rate_limited", error: `Too many market X-rays from this connection. Try again in ${wait} seconds.`, retryAfter: wait };
    }
    pending = buildMarketXray(ref, { audit: getAudit, budgetMs: MARKET_BUDGET_MS, preferredFills: (id, since) => tatumMarketFills(id, since) })
      .then((r) => { (r.complete ? complete : partial).set(key, r); return r; })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    const [result, stamp] = await Promise.all([pending, anchor()]);
    return { ok: true, cached: false, result: { ...result, anchor: stamp } };
  } catch (e) {
    if (e instanceof PublicApiError && e.status === 404) return { ok: false, status: 404, code: "not_found", error: `Polymarket has no market for that reference (${e.message}).` };
    const detail = e instanceof PublicApiError ? e.message : "unexpected error";
    return { ok: false, status: 502, code: "upstream", error: `Could not read this market from Polymarket's public API (${detail}). Try again in a minute.` };
  }
}

export type HandleResponse =
  | { ok: true; address: string; name: string }
  | { ok: false; status: number; code: "bad_handle" | "not_found" | "rate_limited" | "upstream"; error: string; retryAfter?: number };

/** `@username` to the wallet behind it, through Polymarket's public profile search (exact name match only). */
export async function runHandleLookup(handle: string, clientKey: string): Promise<HandleResponse> {
  const clean = handle.replace(/^@/, "").trim();
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(clean)) return { ok: false, status: 400, code: "bad_handle", error: "That is not a Polymarket username." };
  if (isAddress(clean)) return { ok: true, address: clean.toLowerCase(), name: clean };
  const wait = handleLimiter.hit(clientKey);
  if (wait > 0) return { ok: false, status: 429, code: "rate_limited", error: `Too many lookups. Try again in ${wait} seconds.`, retryAfter: wait };
  try {
    const found = await resolveProfileHandle(clean, { attempts: 2, timeoutMs: 8000 });
    return found
      ? { ok: true, ...found }
      : { ok: false, status: 404, code: "not_found", error: "No Polymarket profile has exactly that username. Open the profile page and use the address shown there." };
  } catch {
    return { ok: false, status: 502, code: "upstream", error: "Could not reach Polymarket's profile search. Try again in a minute." };
  }
}
