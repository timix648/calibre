import { RateLimiter, TtlCache, auditAddress, isAddress, PublicApiError, type WalletAuditResult } from "@calibre/public-data";

/** Audits are cached for ten minutes and de-duplicated while in flight. State lives in the server instance's memory. */
const CACHE_MS = 10 * 60_000;
const cache = new TtlCache<WalletAuditResult>(CACHE_MS);
const inflight = new Map<string, Promise<WalletAuditResult>>();
/** Uncached audits per client: each one makes a few requests to Polymarket's public API. */
const limiter = new RateLimiter(8, 60_000);

export type AuditResponse =
  | { ok: true; cached: boolean; result: WalletAuditResult }
  | { ok: false; status: number; code: "bad_address" | "rate_limited" | "upstream"; error: string; retryAfter?: number };

export async function runWalletAudit(address: string, clientKey: string): Promise<AuditResponse> {
  if (!isAddress(address)) {
    return { ok: false, status: 400, code: "bad_address", error: "That is not a wallet address. It should start with 0x and have 40 hex characters." };
  }
  const key = address.toLowerCase();
  const hit = cache.get(key);
  if (hit) return { ok: true, cached: true, result: hit };

  let pending = inflight.get(key);
  if (!pending) {
    const wait = limiter.hit(clientKey);
    if (wait > 0) {
      return { ok: false, status: 429, code: "rate_limited", error: `Too many audits from this connection. Try again in ${wait} seconds.`, retryAfter: wait };
    }
    pending = auditAddress(key, { maxTrades: 1000 }).then(
      (r) => { cache.set(key, r); return r; },
    ).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    return { ok: true, cached: false, result: await pending };
  } catch (e) {
    const detail = e instanceof PublicApiError ? e.message : "unexpected error";
    return { ok: false, status: 502, code: "upstream", error: `Could not read this wallet's history from Polymarket's public API (${detail}). Try again in a minute.` };
  }
}
