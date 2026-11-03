import type { Outcome } from "./brier.js";
import { leagueOf } from "./leagues.js";
import { impliedProb } from "./positions.js";
import type { ScoredPick } from "./skill.js";

/** The fields of a wallet trade that scoring needs (shape of Tatum's /wallets/{addr}/trades). */
export interface TradeLike {
  conditionId: string;
  side: "BUY" | "SELL";
  price: number;
  size: number;
  /** Unix seconds. */
  timestamp: number;
  outcome: string;
  slug: string;
}

export interface ResolutionLike {
  outcome: string;
  /** The market's outcome names; a resolution matching none of them (e.g. 50-50) is skipped. */
  outcomes?: string[];
  /** When the game or event started (ms), from Gamma's gameStartTime / eventStartTime. Trades from then on are in-play. */
  startTs?: number;
  /** When the market closed or resolved (ms). Without a start time, the last hours before it are treated as in-play. */
  closeTs?: number;
}

/** Without a known start time, trades in this long before the close are treated as in-play. */
export const PRE_CLOSE_BUFFER_MS = 3 * 3_600_000;
/** Fills at or beyond these prices say the outcome was already known, not forecast. */
export const MIN_PICK_PRICE = 0.03;
export const MAX_PICK_PRICE = 0.97;

/**
 * Time (ms) from which a trade no longer counts as a forecast: the event start when known, otherwise three hours before
 * the close. Trades placed once a game is live, or just before resolution, are reaction speed, not skill.
 */
export function inPlayCutoff(res: Pick<ResolutionLike, "startTs" | "closeTs">): number | undefined {
  if (res.startTs !== undefined && Number.isFinite(res.startTs)) return res.startTs;
  if (res.closeTs !== undefined && Number.isFinite(res.closeTs)) return res.closeTs - PRE_CLOSE_BUFFER_MS;
  return undefined;
}

/** A Gamma timestamp such as `2026-10-15 02:30:00+00` or `2026-10-14T14:14:12Z`, in ms; undefined when absent or unparsable. */
export function parseGammaTime(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const iso = value.trim().replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : undefined;
}

export interface CategorisedPick extends ScoredPick {
  marketId: string;
  league: string;
  marketType: "moneyline" | "spread" | "total" | "prop" | "other";
  notional: number;
}

const MARKET_TYPES: [RegExp, CategorisedPick["marketType"]][] = [
  [/(^|-)spread(-|$)/, "spread"],
  [/(^|-)total(-|$)|(^|-)(over|under|o-u)(-|$)/, "total"],
  [/(^|-)(points|rebounds|assists|player|props?|anytime)(-|$)/, "prop"],
];

/** League and market type from a Polymarket slug, e.g. `nba-okc-cle-2026-11-02-total-227pt5`. */
export function classifySlug(slug: string): { league: string; marketType: CategorisedPick["marketType"] } {
  const s = slug.toLowerCase();
  const league = leagueOf(s);
  for (const [re, type] of MARKET_TYPES) if (re.test(s)) return { league, marketType: type };
  // Game slugs end in a date (team-team-yyyy-mm-dd) when they are the plain winner market.
  return { league, marketType: /\d{4}-\d{2}-\d{2}$/.test(s) ? "moneyline" : "other" };
}

const norm = (x: string) => x.trim().toLowerCase();

/**
 * Turn a wallet's trades into scored picks against resolved outcomes.
 * Buying an outcome at price q signals a belief above q; selling it signals a belief below q.
 * The market probability at pick time is the trade price itself. Unresolved markets and
 * 50-50 style resolutions (outcome matching no traded name) are skipped, and so are trades that cannot be forecasts:
 * placed once the game or event had started (or in the last three hours before the close when no start is known), or at a
 * price of 0.97 and above or 0.03 and below, where the outcome was effectively known. `leagueFor` files a trade under a
 * category of its own (e.g. politics) instead of its slug's league; slugs of unknown leagues are filed as `other`.
 */
export type TradePhase = "pregame" | "inplay" | "all";

export function tradesToPicks<T extends TradeLike>(
  trades: T[],
  resolutions: Map<string, ResolutionLike | null>,
  k = 0.25,
  leagueFor?: (trade: T) => string | null | undefined,
  phase: TradePhase = "pregame",
): CategorisedPick[] {
  const out: CategorisedPick[] = [];
  for (const t of trades) {
    const res = resolutions.get(t.conditionId);
    if (!res || !(t.price > MIN_PICK_PRICE && t.price < MAX_PICK_PRICE)) continue;
    const cutoff = inPlayCutoff(res);
    // In-play skill is reaction speed during a live event; pre-game skill is forecasting. They are scored separately.
    const inPlay = cutoff !== undefined && t.timestamp * 1000 >= cutoff;
    if (phase === "pregame" && inPlay) continue;
    if (phase === "inplay" && (cutoff === undefined || !inPlay)) continue;
    const pick = scoreTrade(t, res, k, leagueFor);
    if (pick) out.push(pick);
  }
  return out;
}

/** True when a fill's price says the outcome was effectively already decided (0.97 and above, or 0.03 and below). */
export function isSnipePrice(price: number): boolean {
  return price >= MAX_PICK_PRICE || price <= MIN_PICK_PRICE;
}

/**
 * The bets `tradesToPicks` drops for being priced at 0.97 and above or 0.03 and below ("sniping" an outcome that is
 * already decided), scored the same way against the resolution, in every phase. Prices of exactly 0 or 1 are impossible fills
 * and are skipped.
 */
export function tradesToSnipePicks<T extends TradeLike>(
  trades: T[],
  resolutions: Map<string, ResolutionLike | null>,
  k = 0.25,
  leagueFor?: (trade: T) => string | null | undefined,
): CategorisedPick[] {
  const out: CategorisedPick[] = [];
  for (const t of trades) {
    const res = resolutions.get(t.conditionId);
    if (!res || !isSnipePrice(t.price) || !(t.price > 0 && t.price < 1)) continue;
    const pick = scoreTrade(t, res, k, leagueFor);
    if (pick) out.push(pick);
  }
  return out;
}

/** One trade scored against its market's resolution, with no price or phase filtering (null: unscorable). */
function scoreTrade<T extends TradeLike>(
  t: T, res: ResolutionLike, k: number, leagueFor?: (trade: T) => string | null | undefined,
): CategorisedPick | null {
  if (!(t.size > 0)) return null;
  const resolved = norm(res.outcome);
  if (!resolved || (res.outcomes && !res.outcomes.some((o) => norm(o) === resolved))) return null;
  const won: Outcome = norm(t.outcome) === resolved ? 1 : 0;
  // A sell of X at q is a bet on "not X" at 1 - q, so score it from that side.
  const buy = t.side === "BUY";
  const pMkt = buy ? t.price : 1 - t.price;
  const category = leagueFor?.(t);
  const { league, marketType } = category ? { league: category, marketType: "other" as const } : classifySlug(t.slug);
  return {
    marketId: t.conditionId,
    pSrc: impliedProb("YES", pMkt, k),
    pMkt,
    y: buy ? won : ((1 - won) as Outcome),
    ts: t.timestamp * 1000,
    league,
    marketType,
    notional: t.price * t.size,
  };
}

/**
 * Keep one pick per wallet per market (the first, size-weighted average if several trades),
 * so a wallet that splits one bet into 20 fills is not counted 20 times.
 */
export function onePickPerMarket(picks: CategorisedPick[]): CategorisedPick[] {
  const byMarket = new Map<string, CategorisedPick[]>();
  for (const p of picks) {
    const list = byMarket.get(p.marketId) ?? [];
    list.push(p);
    byMarket.set(p.marketId, list);
  }
  const out: CategorisedPick[] = [];
  for (const list of byMarket.values()) {
    const w = list.reduce((s, p) => s + p.notional, 0) || 1;
    const avg = (f: (p: CategorisedPick) => number) => list.reduce((s, p) => s + f(p) * p.notional, 0) / w;
    const first = list.reduce((a, b) => (a.ts <= b.ts ? a : b));
    out.push({ ...first, pSrc: avg((p) => p.pSrc), pMkt: avg((p) => p.pMkt), notional: w });
  }
  return out;
}
