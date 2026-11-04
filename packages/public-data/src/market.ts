import {
  SQUARE_TOP_TAKERS, XRAY_TONE, aggregateFlows, classifySlug, isReliableLabel, isSnipePrice, latestMove, priceSeriesFromTrades, publicTradesToFlows, squareMoneyNote,
  squareMoneyShare, xrayLabel, xraySentence,
  type Move, type SquareMoney, type TimedFlowTrade, type WalletFlow, type XrayLabel, type XrayTone,
} from "@calibre/core";
import type { WalletAuditResult } from "./audit";
import { GAMMA_API, PublicApiError, fetchMarketTradesSince, getJson, isAddress, type FetchOpts } from "./polymarket";

/** How far back a move is looked for. */
export const MOVE_WINDOW_MS = 6 * 3_600_000;
/** The smallest move reported, in probability points. */
export const MIN_MOVE = 0.04;
/** How many of the takers pushing the move are audited. */
export const TOP_TAKERS = SQUARE_TOP_TAKERS;
/** Fill pages read (500 fills each). */
export const MAX_FILL_PAGES = 4;
/** Total time the X-ray may take before it returns what it has. */
export const DEFAULT_BUDGET_MS = 25_000;

// ---------------------------------------------------------------------------------------------------------------------
// Reading what the user pasted

export type MarketRef =
  | { kind: "condition"; conditionId: string }
  /** A Polymarket slug: an event, a market, or either (`marketSlug` is set when a URL named a market inside an event). */
  | { kind: "slug"; slug: string; marketSlug?: string };

const CONDITION_ID = /^0x[0-9a-fA-F]{64}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,200}$/;

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

/**
 * Reads a market reference: a Polymarket event or market URL (`polymarket.com/event/<slug>[/<market-slug>]`,
 * `/market/<slug>`), a bare slug, or a condition id (0x and 64 hex digits). Null for anything else.
 */
export function parseMarketRef(input: string): MarketRef | null {
  const text = safeDecode(input).trim();
  if (!text) return null;
  if (CONDITION_ID.test(text)) return { kind: "condition", conditionId: text.toLowerCase() };
  const looksLikeUrl = /^https?:\/\//i.test(text) || /^(www\.)?polymarket\.com\//i.test(text) || /^\/?(event|market)\//i.test(text);
  if (looksLikeUrl) {
    let path = text.replace(/^https?:\/\//i, "").replace(/^(www\.)?polymarket\.com/i, "");
    path = path.split(/[?#]/)[0] ?? "";
    const parts = path.split("/").filter(Boolean).map((p) => p.toLowerCase());
    const at = parts.findIndex((p) => p === "event" || p === "market");
    const slug = at >= 0 ? parts[at + 1] : undefined;
    if (!slug || !SLUG.test(slug)) return null;
    if (CONDITION_ID.test(slug)) return { kind: "condition", conditionId: slug };
    const next = parts[at + 2];
    if (parts[at] === "event" && next && SLUG.test(next)) return { kind: "slug", slug, marketSlug: next };
    return { kind: "slug", slug };
  }
  const bare = text.toLowerCase();
  // A wallet address or a mistyped condition id is not a slug.
  if (bare.startsWith("0x")) return null;
  return SLUG.test(bare) ? { kind: "slug", slug: bare } : null;
}

/** A stable cache key for a reference. */
export function marketRefKey(ref: MarketRef): string {
  return ref.kind === "condition" ? ref.conditionId : ref.marketSlug ? `${ref.slug}/${ref.marketSlug}` : ref.slug;
}

/** The profile handle in a `polymarket.com/@name` path or a bare `@name`; null otherwise. */
export function parseProfileHandle(input: string): string | null {
  const text = safeDecode(input).trim();
  const m = /(?:^|\/)@([A-Za-z0-9_.-]{1,60})(?:[/?#]|$)/.exec(text);
  return m?.[1] ?? null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Resolving a reference through Gamma (free)

export interface ResolvedMarket {
  conditionId: string;
  slug: string;
  eventSlug: string | null;
  question: string;
  /** The first outcome is "YES" for price and flow purposes. */
  outcomes: [string, string];
  yesPrice: number | null;
  closed: boolean;
  volume: number;
}

function parseList(v: unknown): string[] | null {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v !== "string") return null;
  try { const x = JSON.parse(v); return Array.isArray(x) ? x.map(String) : null; } catch { return null; }
}

const isBinary = (m: any): boolean => (parseList(m?.outcomes)?.length ?? 0) === 2 && typeof m?.conditionId === "string";
const isLive = (m: any): boolean => m?.closed !== true && m?.active !== false;
const volumeOf = (m: any): number => Number(m?.volumeNum ?? m?.volume ?? 0) || 0;

/**
 * The market an event page is about: the market the page named, else the one whose slug is the event slug (the winner market
 * of a game), else the biggest live moneyline-like binary market, else the biggest binary one. Null when none is binary.
 */
export function pickMainMarket(markets: any[], opts: { eventSlug?: string; marketSlug?: string } = {}): any | null {
  const binary = markets.filter(isBinary);
  if (binary.length === 0) return null;
  const named = opts.marketSlug ? binary.find((m) => String(m.slug).toLowerCase() === opts.marketSlug) : undefined;
  if (named) return named;
  const exact = opts.eventSlug ? binary.find((m) => String(m.slug).toLowerCase() === opts.eventSlug) : undefined;
  if (exact) return exact;
  const rank = (m: any) => (isLive(m) ? 4 : 0) + (classifySlug(String(m.slug ?? "")).marketType === "moneyline" ? 2 : 0);
  return [...binary].sort((a, b) => rank(b) - rank(a) || volumeOf(b) - volumeOf(a))[0] ?? null;
}

/** A Gamma market row in the shape the X-ray uses (null when it is not a binary market). */
export function toResolvedMarket(m: any, eventSlug?: string | null): ResolvedMarket | null {
  const outcomes = parseList(m?.outcomes);
  if (!outcomes || outcomes.length !== 2 || typeof m?.conditionId !== "string") return null;
  const prices = parseList(m.outcomePrices)?.map(Number);
  const yes = prices?.[0];
  return {
    conditionId: m.conditionId.toLowerCase(),
    slug: String(m.slug ?? ""),
    eventSlug: eventSlug ?? (Array.isArray(m.events) && m.events[0]?.slug ? String(m.events[0].slug) : null),
    question: String(m.question ?? m.title ?? m.slug ?? ""),
    outcomes: [outcomes[0]!, outcomes[1]!],
    yesPrice: yes !== undefined && Number.isFinite(yes) ? yes : null,
    closed: m.closed === true,
    volume: volumeOf(m),
  };
}

/** Resolve a reference to one binary market with Gamma (`/markets?slug=`, `/events?slug=`, `/markets?condition_ids=`). */
export async function resolveMarket(ref: MarketRef, opts: FetchOpts = {}): Promise<ResolvedMarket> {
  const notFound = () => new PublicApiError("no such Polymarket market", 404);
  if (ref.kind === "condition") {
    const rows = await getJson<any[]>(`${GAMMA_API}/markets?condition_ids=${ref.conditionId}`, opts);
    const m = rows.find((r) => String(r.conditionId).toLowerCase() === ref.conditionId);
    const out = m ? toResolvedMarket(m) : null;
    if (!out) throw notFound();
    return out;
  }
  // A URL that named an event and a market, or a bare slug: try the market slug first, then the event.
  const marketSlug = ref.marketSlug ?? ref.slug;
  const direct = await getJson<any[]>(`${GAMMA_API}/markets?slug=${encodeURIComponent(marketSlug)}`, opts);
  const hit = direct.find((m) => String(m.slug).toLowerCase() === marketSlug);
  if (hit) {
    const out = toResolvedMarket(hit, ref.marketSlug ? ref.slug : undefined);
    if (out) return out;
  }
  const events = await getJson<any[]>(`${GAMMA_API}/events?slug=${encodeURIComponent(ref.slug)}`, opts);
  const event = events.find((e) => String(e.slug).toLowerCase() === ref.slug);
  if (!event) throw notFound();
  const main = pickMainMarket(event.markets ?? [], { eventSlug: ref.slug, ...(ref.marketSlug ? { marketSlug: ref.marketSlug } : {}) });
  const out = main ? toResolvedMarket(main, ref.slug) : null;
  if (!out) throw new PublicApiError("this event has no binary market to X-ray", 404);
  return out;
}

/** The wallet behind a Polymarket username, from Gamma's public profile search (exact, case-insensitive match only). */
export async function resolveProfileHandle(handle: string, opts: FetchOpts = {}): Promise<{ address: string; name: string } | null> {
  const q = handle.trim();
  if (!q) return null;
  const r = await getJson<{ profiles?: { name?: string; pseudonym?: string; proxyWallet?: string }[] }>(
    `${GAMMA_API}/public-search?q=${encodeURIComponent(q)}&search_profiles=true&limit_per_type=10`, opts);
  const hit = (r.profiles ?? []).find((p) => (p.name ?? "").toLowerCase() === q.toLowerCase() || (p.pseudonym ?? "").toLowerCase() === q.toLowerCase());
  return hit?.proxyWallet && isAddress(hit.proxyWallet) ? { address: hit.proxyWallet.toLowerCase(), name: hit.name || hit.pseudonym || q } : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Analysing the fills (pure)

export interface MoveAnalysis {
  move: Move | null;
  noMoveReason?: string;
  /** All wallets that traded in the move window, with the net bet on YES. */
  flows: WalletFlow[];
  /** Wallets pushing the move, biggest first. */
  pushers: WalletFlow[];
  /** Fills inside the move window. */
  moveFills: number;
}

/**
 * Finds the latest move of at least `minJump` in the last `windowMs` from 5-minute closes of the fills, and the wallets that
 * pushed it (net bet in the move's direction, biggest first). The move window starts one bucket before the move began.
 */
export function analyseFills(fills: TimedFlowTrade[], now: number, opts: { windowMs?: number; minJump?: number } = {}): MoveAnalysis {
  const windowMs = opts.windowMs ?? MOVE_WINDOW_MS;
  const recent = fills.filter((f) => f.ts >= now - windowMs && f.ts <= now + 60_000);
  const none = (noMoveReason: string): MoveAnalysis => ({ move: null, noMoveReason, flows: [], pushers: [], moveFills: 0 });
  if (recent.length === 0) return none("No trades in the last 6 hours.");
  const points = priceSeriesFromTrades(recent);
  const move = latestMove(points, { minJump: opts.minJump ?? MIN_MOVE, windowMs });
  if (!move) return none("No recent move: the price has not shifted by 4 points or more in the last 6 hours.");
  const inMove = recent.filter((f) => f.ts >= move.startTs - 5 * 60_000);
  const flows = aggregateFlows(inMove, () => undefined);
  const dir = Math.sign(move.to - move.from) || 1;
  const pushers = flows.filter((f) => Math.sign(f.netYesUsd) === dir).sort((a, b) => Math.abs(b.netYesUsd) - Math.abs(a.netYesUsd));
  return { move, flows, pushers, moveFills: inMove.length };
}

// ---------------------------------------------------------------------------------------------------------------------
// The response

export interface TakerXray {
  address: string;
  name: string | null;
  /** The outcome this wallet bet on in the move. */
  pushed: string;
  /** Net notional bet in the move's direction, USD. */
  netUsd: number;
  /** Notional-weighted YES price it traded at. */
  avgYesPrice: number;
  label: XrayLabel | null;
  tone: XrayTone | null;
  /** True when the label is the one that holds going forward (a proven losing record). */
  reliable: boolean;
  sentence: string | null;
  audit: { n: number; edge: number; z: number; snipingShare: number; tradesFetched: number } | null;
  /** "audited", "pending" (the audit was still running when the time ran out) or "failed". */
  status: "audited" | "pending" | "failed";
}

export interface MarketXray {
  market: {
    conditionId: string; slug: string; eventSlug: string | null; question: string; yesOutcome: string; noOutcome: string;
    yesPrice: number | null; closed: boolean; url: string;
  };
  move: {
    from: number; to: number; points: number; direction: "up" | "down"; startTs: number; endTs: number; fills: number;
    /** The price ended at 0.97 and above or 0.03 and below: the market is settling on a result, not repricing. */
    settling: boolean;
  } | null;
  noMoveReason: string | null;
  takers: TakerXray[];
  squareMoney: (SquareMoney & { note: string }) | null;
  /** Always shown with the numbers: what the square-money share does and does not mean. */
  caution: string;
  fills: { read: number; pages: number; oldestTs: number | null; newestTs: number | null; reachedWindowStart: boolean };
  /** False when some audits were still running (or failed) at the deadline: the result is partial. */
  complete: boolean;
  fetchedAt: string;
  elapsedMs: number;
  source: "polymarket-public";
}

export const MARKET_CAUTION =
  "Square money is a caution signal, not a trade recommendation. Only a proven losing record is a reliable label: past winners rarely stay ahead, and whether moves pushed by losing wallets reverse has not been shown. Only the biggest takers are judged, so read the coverage.";

export type TakerAudit = { status: "audited"; result: WalletAuditResult } | { status: "pending" } | { status: "failed" };

/** Shape the response from the analysis, the audits that finished and the fills read. Pure. */
export function shapeMarketXray(input: {
  market: ResolvedMarket;
  analysis: MoveAnalysis;
  audits: ReadonlyMap<string, TakerAudit>;
  names: ReadonlyMap<string, string>;
  fills: { read: number; pages: number; oldestTs: number | null; newestTs: number | null; reachedWindowStart: boolean };
  topTakers?: number;
  startedAt: number;
  now: number;
}): MarketXray {
  const { market, analysis, audits, names, fills } = input;
  const dir = analysis.move ? Math.sign(analysis.move.to - analysis.move.from) || 1 : 1;
  const top = analysis.pushers.slice(0, input.topTakers ?? TOP_TAKERS);
  const takers: TakerXray[] = top.map((f) => {
    const a = audits.get(f.wallet) ?? { status: "failed" as const };
    const result = a.status === "audited" ? a.result : null;
    const label = result ? xrayLabel(result.audit) : null;
    return {
      address: f.wallet,
      name: result?.name ?? names.get(f.wallet) ?? null,
      pushed: dir > 0 ? market.outcomes[0] : market.outcomes[1],
      netUsd: Math.abs(f.netYesUsd),
      avgYesPrice: f.avgYesPrice,
      label,
      tone: label ? XRAY_TONE[label] : null,
      reliable: label ? isReliableLabel(label) : false,
      sentence: result ? xraySentence(result.audit) : null,
      audit: result
        ? { n: result.audit.n, edge: result.audit.overall.edge, z: result.audit.overall.z, snipingShare: result.audit.sniping.share, tradesFetched: result.tradesFetched }
        : null,
      status: a.status,
    };
  });
  const labels = new Map<string, XrayLabel | null>(takers.map((t) => [t.address, t.label]));
  const square = analysis.move ? squareMoneyShare(analysis.flows, labels, dir) : null;
  const m = analysis.move;
  return {
    market: {
      conditionId: market.conditionId, slug: market.slug, eventSlug: market.eventSlug, question: market.question,
      yesOutcome: market.outcomes[0], noOutcome: market.outcomes[1], yesPrice: market.yesPrice, closed: market.closed,
      url: `https://polymarket.com/event/${market.eventSlug ?? market.slug}${market.eventSlug && market.slug && market.slug !== market.eventSlug ? `/${market.slug}` : ""}`,
    },
    move: m
      ? { from: m.from, to: m.to, points: (m.to - m.from) * 100, direction: dir > 0 ? "up" : "down", startTs: m.startTs, endTs: m.endTs, fills: analysis.moveFills, settling: isSnipePrice(m.to) }
      : null,
    noMoveReason: m ? null : analysis.noMoveReason ?? "No recent move.",
    takers,
    squareMoney: square ? { ...square, note: squareMoneyNote(square) } : null,
    caution: MARKET_CAUTION,
    fills,
    complete: takers.every((t) => t.status === "audited"),
    fetchedAt: new Date(input.now).toISOString(),
    elapsedMs: input.now - input.startedAt,
    source: "polymarket-public",
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The whole thing

export interface BuildMarketXrayOptions {
  /** Audits one wallet; give a cached one on a server. Rejects are reported as failed. */
  audit: (address: string) => Promise<WalletAuditResult>;
  /** Total time before the partial result is returned. */
  budgetMs?: number;
  now?: () => number;
  fetch?: FetchOpts;
}

const timedOut = Symbol("timeout");

/**
 * Market X-ray: resolve the reference with Gamma, read the market's recent fills, find the latest move of 4 points or more
 * in the last 6 hours, audit the biggest takers pushing it, and measure the share of the pushing money that came from
 * wallets with a proven losing record. Audits still running at the deadline come back as "pending" with `complete: false`
 * (they keep running in the caller's cache, so a retry is fast). Uses only Polymarket's free public APIs.
 */
export async function buildMarketXray(ref: MarketRef, opts: BuildMarketXrayOptions): Promise<MarketXray> {
  const clock = opts.now ?? Date.now;
  const startedAt = clock();
  const deadline = startedAt + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  const fetchOpts: FetchOpts = { attempts: 2, timeoutMs: 8000, ...opts.fetch };

  const market = await resolveMarket(ref, fetchOpts);
  const since = startedAt - MOVE_WINDOW_MS;
  const read = await fetchMarketTradesSince(market.conditionId, since, MAX_FILL_PAGES, fetchOpts);
  const fills = publicTradesToFlows(read.trades);
  const names = new Map<string, string>();
  for (const t of read.trades) {
    const n = t.name || t.pseudonym;
    if (n) names.set(t.proxy_wallet.toLowerCase(), n);
  }
  const stamps = read.trades.map((t) => t.timestamp * 1000);
  const analysis = analyseFills(fills, startedAt);

  const audits = new Map<string, TakerAudit>();
  const top = analysis.pushers.slice(0, TOP_TAKERS);
  await Promise.all(top.map(async (f) => {
    const remaining = Math.max(1000, deadline - clock());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const outcome = await Promise.race([
        opts.audit(f.wallet),
        new Promise<typeof timedOut>((resolve) => { timer = setTimeout(() => resolve(timedOut), remaining); }),
      ]);
      audits.set(f.wallet, outcome === timedOut ? { status: "pending" } : { status: "audited", result: outcome });
    } catch {
      audits.set(f.wallet, { status: "failed" });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }));

  return shapeMarketXray({
    market, analysis, audits, names, startedAt, now: clock(),
    fills: {
      read: read.trades.length, pages: read.pages,
      oldestTs: stamps.length ? Math.min(...stamps) : null, newestTs: stamps.length ? Math.max(...stamps) : null,
      reachedWindowStart: read.reachedSince,
    },
  });
}
