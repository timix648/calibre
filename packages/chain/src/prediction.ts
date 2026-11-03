import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const PREDICTION_BASE = "https://api.tatum.io/v4/data/prediction";

export type Platform = "polymarket" | "kalshi";
export type EventStatus = "active" | "closed" | "resolved";
export type EventSort = "volume_desc" | "liquidity_desc" | "endingSoon" | "newest";
export type Interval = "1m" | "5m" | "15m" | "1h" | "1d";

export interface PredictionEvent {
  id: string;
  platform: Platform;
  title: string;
  category: string | null;
  status: string;
  openTime: string;
  closeTime: string;
  totalVolume: number;
  markets: string[];
}

export interface Market {
  id: string;
  platform: Platform;
  eventId: string;
  question: string;
  status: string;
  closeTime: string;
  outcomes: { name: string; price: number }[];
  volume: number;
  resolution: { outcome: string; resolvedAt: string; source: string } | null;
}

export interface MarketTrade {
  tradeId: string;
  marketId: string;
  side: "yes" | "no";
  direction: "buy" | "sell";
  price: number;
  size: number;
  notionalValue: number;
  taker: string;
  timestamp: string;
}

export interface WalletTrade {
  proxyWallet: string;
  side: "BUY" | "SELL";
  conditionId: string;
  size: number;
  price: number;
  /** Unix seconds. */
  timestamp: number;
  title: string;
  slug: string;
  eventSlug: string;
  outcome: string;
  outcomeIndex: number;
}

export interface TopTrader {
  rank: number;
  proxyWallet: string;
  userName: string | null;
  vol: number;
  pnl: number;
}

export interface Candle { timestamp: string; open: number; high: number; low: number; close: number; volume: number }

export interface PredictionClientOptions {
  /** Requests per second (Tatum free plan is about 3). */
  rps?: number;
  /** Directory for the on-disk response cache; omit to disable. */
  cacheDir?: string;
  fetch?: typeof fetch;
  maxRetries?: number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * Hard cap on network calls (credits are limited). Counted across runs in `budgetFile` when given.
   * Cache hits do not count. Default: no cap.
   */
  callBudget?: number;
  budgetFile?: string;
}

export class TatumBudgetExceeded extends Error {
  constructor(readonly used: number, readonly budget: number) {
    super(`Tatum call budget exhausted (${used}/${budget}). Raise TATUM_CALL_BUDGET deliberately if this is intended.`);
  }
}

export interface CacheOptions {
  /** How long a cached response stays valid; Infinity for immutable data. Default 0 (no cache). */
  ttlMs?: number;
}

export class PredictionApiError extends Error {
  constructor(readonly status: number, readonly path: string, body: string) {
    super(`Tatum Prediction API ${status} on ${path}: ${body.slice(0, 300)}`);
  }
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function qs(params: Record<string, string | number | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  return entries.length ? "?" + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&") : "";
}

/** Typed, rate-limited, retrying, disk-cached client for Tatum's Prediction Markets API. */
export class PredictionClient {
  private readonly minGapMs: number;
  private nextSlot = 0;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxRetries: number;

  constructor(private readonly apiKey: string, private readonly opts: PredictionClientOptions = {}) {
    this.minGapMs = 1000 / (opts.rps ?? 3);
    this.fetchImpl = opts.fetch ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
    this.maxRetries = opts.maxRetries ?? 4;
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const wait = Math.max(0, this.nextSlot - now);
    this.nextSlot = Math.max(now, this.nextSlot) + this.minGapMs;
    if (wait > 0) await this.sleep(wait);
  }

  private used: number | null = null;

  /** Count one network call against the budget; throws before the call when the budget is spent. */
  private async spend(): Promise<void> {
    const budget = this.opts.callBudget;
    if (budget === undefined) return;
    if (this.used === null) {
      try { this.used = (JSON.parse(await readFile(this.opts.budgetFile ?? "", "utf8")) as { used: number }).used; }
      catch { this.used = 0; }
    }
    if (this.used >= budget) throw new TatumBudgetExceeded(this.used, budget);
    this.used++;
    if (this.opts.budgetFile) await writeFile(this.opts.budgetFile, JSON.stringify({ used: this.used, budget }));
  }

  /** Network calls counted so far (null until the first call when a budget is set). */
  get callsUsed(): number | null { return this.used; }

  private cachePath(path: string): string | null {
    if (!this.opts.cacheDir) return null;
    return join(this.opts.cacheDir, createHash("sha1").update(path).digest("hex") + ".json");
  }

  async get<T>(path: string, cache: CacheOptions = {}): Promise<T> {
    const ttl = cache.ttlMs ?? 0;
    const file = ttl > 0 ? this.cachePath(path) : null;
    if (file) {
      try {
        const hit = JSON.parse(await readFile(file, "utf8")) as { at: number; body: T };
        if (Date.now() - hit.at < ttl) return hit.body;
      } catch { /* miss */ }
    }

    for (let attempt = 0; ; attempt++) {
      await this.spend();
      await this.throttle();
      const res = await this.fetchImpl(PREDICTION_BASE + path, { headers: { "x-api-key": this.apiKey } });
      if (res.ok) {
        const body = (await res.json()) as T;
        if (file) {
          await mkdir(this.opts.cacheDir!, { recursive: true });
          await writeFile(file, JSON.stringify({ at: Date.now(), path, body }));
        }
        return body;
      }
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= this.maxRetries) throw new PredictionApiError(res.status, path, await res.text());
      await this.sleep(500 * 2 ** attempt);
    }
  }

  async events(p: { platform?: Platform; status?: EventStatus; category?: string; limit?: number; sort?: EventSort; cursor?: string } = {}) {
    return this.get<{ data: PredictionEvent[]; pagination: { cursor?: string } }>(`/events${qs(p)}`, { ttlMs: 5 * 60_000 });
  }

  /** Resolved markets never change, so they are cached forever; open ones for a minute. */
  async market(id: string): Promise<Market> {
    const path = `/markets/${id}`;
    const cached = await this.get<{ data: Market }>(path, { ttlMs: Infinity }).catch(() => null);
    if (cached?.data.resolution) return cached.data;
    return (await this.get<{ data: Market }>(path + qs({ t: Math.floor(Date.now() / 60_000) }), { ttlMs: 60_000 })).data;
  }

  async marketTrades(id: string, p: { limit?: number; cursor?: string } = {}) {
    return this.get<{ data: MarketTrade[]; pagination: { cursor?: string } }>(`/markets/${id}/trades${qs({ limit: 100, ...p })}`);
  }

  async marketHistory(id: string, p: { interval: Interval; start: string; end: string }) {
    return (await this.get<{ data: { candles: Candle[] } }>(`/markets/${id}/history${qs(p)}`, { ttlMs: 10 * 60_000 })).data.candles;
  }

  async topTraders(p: { category?: string; limit?: number; offset?: number } = {}) {
    return (await this.get<{ data: TopTrader[] }>(`/top-traders${qs(p)}`, { ttlMs: 60 * 60_000 })).data;
  }

  async walletTrades(address: string, p: { limit?: number; offset?: number } = {}) {
    return (await this.get<{ data: WalletTrade[] }>(`/wallets/${address}/trades${qs({ limit: 100, ...p })}`, { ttlMs: 30 * 60_000 })).data;
  }

  /** Up to `maxTrades` most recent trades of a wallet, newest first. */
  async walletHistory(address: string, maxTrades = 500): Promise<WalletTrade[]> {
    const out: WalletTrade[] = [];
    for (let offset = 0; offset < maxTrades; offset += 100) {
      const page = await this.walletTrades(address, { limit: 100, offset });
      out.push(...page);
      if (page.length < 100) break;
    }
    return out.slice(0, maxTrades);
  }
}
