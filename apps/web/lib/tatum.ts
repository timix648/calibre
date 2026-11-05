import type { TimedFlowTrade } from "@calibre/core";
import { CreditMeter, TATUM_CREDITS } from "@calibre/chain/src/credits";
import { latestCheckpoint, latestCheckpointPublic, tatumSuiClient, transactionStatus, type TransactionCheck } from "@calibre/chain/src/suiGrpc";

/**
 * Tatum on the website. Every X-ray is stamped with the latest Sui checkpoint read through Tatum's Sui gRPC gateway, market
 * X-rays read their fills from Tatum's Prediction Markets API, wallet X-rays add Tatum's open-position value and markets-traded
 * count, and paid calls have their payment confirmed through Tatum's gRPC. Each request is counted at Tatum's listed credit
 * price against a daily budget (TATUM_DAILY_CREDITS, default 150,000), and a plan error (402) pauses Tatum for 15 minutes.
 * Whenever Tatum cannot answer, the free source takes over and the result says which one answered.
 *
 * The meter lives in each server instance's memory, so the budget is per instance; at this site's traffic that is one or two.
 */

const KEY = process.env.TATUM_API_KEY?.trim() || null;
const API = "https://api.tatum.io/v4/data/prediction";
const meter = new CreditMeter({ dailyBudget: Number(process.env.TATUM_DAILY_CREDITS ?? 150_000) || 150_000 });
const PAUSE_ON_PLAN_ERROR_MS = 15 * 60_000;

export type AnchorSource = "tatum-grpc" | "sui-public-graphql";
export interface Anchor { sequence: string; timestamp: string | null; source: AnchorSource; readAt: string }
export interface TatumWalletSnapshot { openValueUsd: number | null; marketsTraded: number | null; source: "tatum" }

let sui: ReturnType<typeof tatumSuiClient> | null = null;
const suiClient = () => (sui ??= tatumSuiClient(KEY!));

const noteFailure = (e: unknown): void => {
  const msg = e instanceof Error ? e.message : String(e);
  if (/\b402\b|plan limit|exceeded/i.test(msg)) meter.pause(PAUSE_ON_PLAN_ERROR_MS, msg);
};

/** Status of the Tatum integration on this instance, for the diagnostics route. Never includes the key. */
export function tatumStatus() {
  return { configured: KEY !== null, ...meter.state() };
}

// ---------------------------------------------------------------------------------------------------------------------
// The checkpoint stamp: one gRPC query (2 credits) shared by every X-ray in a 15-second window.

const ANCHOR_TTL_MS = 15_000;
let anchorCache: { at: number; value: Anchor } | null = null;
let anchorInflight: Promise<Anchor> | null = null;

export async function anchor(): Promise<Anchor | null> {
  if (anchorCache && Date.now() - anchorCache.at < ANCHOR_TTL_MS) return anchorCache.value;
  anchorInflight ??= (async () => {
    const readAt = new Date().toISOString();
    if (KEY && meter.allow(TATUM_CREDITS.grpcQuery)) {
      try {
        const c = await latestCheckpoint(suiClient());
        meter.spend(TATUM_CREDITS.grpcQuery);
        return { sequence: c.sequence, timestamp: c.timestamp, source: "tatum-grpc" as const, readAt };
      } catch (e) { noteFailure(e); }
    }
    const c = await latestCheckpointPublic();
    return { sequence: c.sequence, timestamp: c.timestamp, source: "sui-public-graphql" as const, readAt };
  })();
  try {
    const value = await anchorInflight;
    anchorCache = { at: Date.now(), value };
    return value;
  } catch {
    return anchorCache?.value ?? null;
  } finally {
    anchorInflight = null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Prediction Markets API

async function tatumGet<T>(path: string, cost: number): Promise<T | null> {
  if (!KEY || !meter.allow(cost)) return null;
  try {
    const res = await fetch(`${API}${path}`, { headers: { "x-api-key": KEY, accept: "application/json" }, signal: AbortSignal.timeout(8_000), cache: "no-store" });
    if (res.status === 402) { meter.pause(PAUSE_ON_PLAN_ERROR_MS, "HTTP 402 (plan limit)"); return null; }
    if (!res.ok) return null;
    meter.spend(cost);
    return (await res.json()) as T;
  } catch (e) {
    noteFailure(e);
    return null;
  }
}

interface TatumTrade { side: "yes" | "no"; direction: "buy" | "sell"; price: number; size: number; taker: string; timestamp: string }

/**
 * A market's fills since `sinceMs`, newest first, from Tatum (100 credits a page of 100, at most `maxPages`). Null when Tatum
 * cannot answer (no key, budget used, plan error, empty), so the caller falls back to Polymarket's public fills.
 */
export async function tatumMarketFills(conditionId: string, sinceMs: number, maxPages = 3): Promise<TimedFlowTrade[] | null> {
  const out: TimedFlowTrade[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const body = await tatumGet<{ data?: TatumTrade[]; pagination?: { cursor?: string } }>(
      `/markets/${conditionId}/trades?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, TATUM_CREDITS.marketTradesPage,
    );
    if (!body) return page === 0 ? null : out;
    let older = false;
    for (const t of body.data ?? []) {
      const ts = Date.parse(t.timestamp);
      if (!Number.isFinite(ts) || !(t.price > 0 && t.price < 1) || !(t.size > 0)) continue;
      if (ts < sinceMs) { older = true; continue; }
      out.push({ taker: t.taker.toLowerCase(), side: t.side, direction: t.direction, price: t.price, size: t.size, ts });
    }
    cursor = body.pagination?.cursor;
    if (older || !cursor || (body.data ?? []).length === 0) break;
  }
  return out.length > 0 ? out : null;
}

const WALLET_TTL_MS = 10 * 60_000;
const walletCache = new Map<string, { at: number; value: TatumWalletSnapshot }>();

/** Tatum's open-position value and lifetime markets-traded count for a wallet (50 credits each, cached 10 minutes). */
export async function tatumWalletSnapshot(address: string): Promise<TatumWalletSnapshot | null> {
  const key = address.toLowerCase();
  const hit = walletCache.get(key);
  if (hit && Date.now() - hit.at < WALLET_TTL_MS) return hit.value;
  const [value, traded] = await Promise.all([
    tatumGet<{ data?: { value?: number } }>(`/wallets/${key}/value`, TATUM_CREDITS.walletValue),
    tatumGet<{ data?: { traded?: number } }>(`/wallets/${key}/markets-traded`, TATUM_CREDITS.walletMarketsTraded),
  ]);
  if (!value && !traded) return null;
  const snap: TatumWalletSnapshot = {
    openValueUsd: typeof value?.data?.value === "number" ? value.data.value : null,
    marketsTraded: typeof traded?.data?.traded === "number" ? traded.data.traded : null,
    source: "tatum",
  };
  walletCache.set(key, { at: Date.now(), value: snap });
  if (walletCache.size > 500) walletCache.delete(walletCache.keys().next().value!);
  return snap;
}

// ---------------------------------------------------------------------------------------------------------------------
// Payment check for the paid agent API: the settled transaction, read back through Tatum's Sui gRPC (2 credits).

export async function confirmPaymentViaTatum(digest: string): Promise<(TransactionCheck & { source: "tatum-grpc" }) | null> {
  if (!KEY || !meter.allow(TATUM_CREDITS.grpcQuery)) return null;
  try {
    const t = await transactionStatus(suiClient(), digest);
    meter.spend(TATUM_CREDITS.grpcQuery);
    return { ...t, source: "tatum-grpc" };
  } catch (e) {
    noteFailure(e);
    return null;
  }
}
