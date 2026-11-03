import type { Outcome } from "./brier.js";
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
  const league = s.split("-")[0] || "other";
  for (const [re, type] of MARKET_TYPES) if (re.test(s)) return { league, marketType: type };
  // Game slugs end in a date (team-team-yyyy-mm-dd) when they are the plain winner market.
  return { league, marketType: /\d{4}-\d{2}-\d{2}$/.test(s) ? "moneyline" : "other" };
}

const norm = (x: string) => x.trim().toLowerCase();

/**
 * Turn a wallet's trades into scored picks against resolved outcomes.
 * Buying an outcome at price q signals a belief above q; selling it signals a belief below q.
 * The market probability at pick time is the trade price itself. Unresolved markets and
 * 50-50 style resolutions (outcome matching no traded name) are skipped. `leagueFor` files a trade under a category
 * of its own (e.g. politics) instead of the first word of its slug.
 */
export function tradesToPicks<T extends TradeLike>(
  trades: T[],
  resolutions: Map<string, ResolutionLike | null>,
  k = 0.25,
  leagueFor?: (trade: T) => string | null | undefined,
): CategorisedPick[] {
  const out: CategorisedPick[] = [];
  for (const t of trades) {
    const res = resolutions.get(t.conditionId);
    if (!res || !(t.price > 0 && t.price < 1) || !(t.size > 0)) continue;
    const resolved = norm(res.outcome);
    if (!resolved || (res.outcomes && !res.outcomes.some((o) => norm(o) === resolved))) continue;
    const won: Outcome = norm(t.outcome) === resolved ? 1 : 0;
    // A sell of X at q is a bet on "not X" at 1 - q, so score it from that side.
    const buy = t.side === "BUY";
    const pMkt = buy ? t.price : 1 - t.price;
    const category = leagueFor?.(t);
    const { league, marketType } = category ? { league: category, marketType: "other" as const } : classifySlug(t.slug);
    out.push({
      marketId: t.conditionId,
      pSrc: impliedProb("YES", pMkt, k),
      pMkt,
      y: buy ? won : ((1 - won) as Outcome),
      ts: t.timestamp * 1000,
      league,
      marketType,
      notional: t.price * t.size,
    });
  }
  return out;
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
