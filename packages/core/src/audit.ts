import { priceEdge, type Edge } from "./edge.js";
import { onePickPerMarket, tradesToPicks, tradesToSnipePicks, type CategorisedPick, type ResolutionLike, type TradeLike } from "./picks.js";

/** Bets needed in a phase before a positive z-score is called a proven edge. */
export const MIN_BETS_FOR_PROVEN = 100;
/** Fewer scored bets than this and the record is too short to call either way. */
export const MIN_BETS_FOR_AUDIT = 30;
/** |z| at or beyond this separates an edge from luck. */
export const AUDIT_Z = 2;
/** A wallet whose resolved bets are more than this share sniping is flagged "mostly sniping". */
export const MOSTLY_SNIPING_SHARE = 0.4;
/** The error band is edge plus and minus this many standard errors. */
export const BAND_SE = 2;

export type AuditVerdict = "proven edge" | "negative edge" | "too early" | "no proven edge (consistent with luck)";

/**
 * The audit's plain-words call on an edge. Fewer than 30 bets is too early whatever the z-score; z >= 2 is a proven edge only
 * with 100 or more bets; z <= -2 is a negative edge; anything else is consistent with luck.
 */
export function auditVerdict(e: { z: number; n: number }): AuditVerdict {
  if (e.n < MIN_BETS_FOR_AUDIT) return "too early";
  if (e.z >= AUDIT_Z && e.n >= MIN_BETS_FOR_PROVEN) return "proven edge";
  if (e.z <= -AUDIT_Z) return "negative edge";
  return "no proven edge (consistent with luck)";
}

/** An edge with its error band (edge +/- 2 standard errors), JSON-safe: unknown values are null. */
export interface EdgeSummary {
  /** Probability points: 0.05 means the wallet's bets won 5 points more often than their prices implied. */
  edge: number;
  se: number | null;
  z: number;
  n: number;
  effN: number;
  low: number | null;
  high: number | null;
  verdict: AuditVerdict;
}

export function summariseEdge(e: Edge): EdgeSummary {
  const finite = Number.isFinite(e.se) && e.n > 0;
  return {
    edge: e.edge,
    se: finite ? e.se : null,
    z: e.z,
    n: e.n,
    effN: e.effN,
    low: finite ? e.edge - BAND_SE * e.se : null,
    high: finite ? e.edge + BAND_SE * e.se : null,
    verdict: auditVerdict(e),
  };
}

export interface LeagueAudit extends EdgeSummary {
  league: string;
}

export interface SnipingSummary {
  /** Markets in which the wallet bought or sold at 0.97 and above or 0.03 and below, among markets it bet in that resolved. */
  markets: number;
  /** Resolved markets the wallet bet in, at any price. */
  resolvedMarkets: number;
  /** markets / resolvedMarkets. */
  share: number;
  /** Edge of the sniping bets against the prices paid (they win almost always, for a tiny margin each). */
  edge: EdgeSummary;
}

export type AuditFlag = "mostly sniping";

export interface WalletAudit {
  /** Scored forecasting bets (one per wallet per market, sniping excluded), pre-game and in-play together. */
  n: number;
  /** Bets placed before the game or event started. */
  pregame: EdgeSummary;
  /** Bets placed once it was live (or in the last three hours before the close when no start is known). */
  inplay: EdgeSummary;
  sniping: SnipingSummary;
  /** Five leagues with the most scored bets. */
  leagues: LeagueAudit[];
  verdict: AuditVerdict;
  flags: AuditFlag[];
  /** The trades given and how many of them fell in a resolved market. */
  trades: number;
  tradesInResolvedMarkets: number;
}

export interface AuditOptions {
  /** Recency half-life of the edge in days; the default Infinity weighs the whole record equally. */
  halfLifeDays?: number;
  now?: number;
  /** Files a trade under a category of its own (e.g. politics) instead of its slug's league. */
  leagueFor?: (trade: TradeLike) => string | null | undefined;
  /** How many leagues the breakdown lists (default 5). */
  topLeagues?: number;
}

const rank: Record<AuditVerdict, number> = { "proven edge": 3, "negative edge": 2, "no proven edge (consistent with luck)": 1, "too early": 0 };

/**
 * Overall call from the two phases. A phase that is proven makes the wallet proven; failing that a negative phase makes it
 * negative; if both phases are too short it is too early; otherwise it is consistent with luck. Sniping never counts as an edge.
 */
export function overallVerdict(phases: Pick<EdgeSummary, "verdict">[]): AuditVerdict {
  return phases.reduce<AuditVerdict>((best, p) => (rank[p.verdict] > rank[best] ? p.verdict : best), "too early");
}

/**
 * Audit one wallet's real record: its edge against the price it paid, split into pre-game and in-play bets, with the
 * bets at decided prices (0.97 and above, 0.03 and below) set apart as sniping, and a breakdown by league.
 * Pure: the caller supplies the trades and the resolutions (with start times) it fetched.
 */
export function auditWallet(
  trades: TradeLike[],
  resolutions: Map<string, ResolutionLike | null>,
  opts: AuditOptions = {},
): WalletAudit {
  const edgeOpts = { halfLifeDays: opts.halfLifeDays ?? Infinity, ...(opts.now !== undefined ? { now: opts.now } : {}) };
  const phasePicks = (phase: "pregame" | "inplay" | "all") =>
    onePickPerMarket(tradesToPicks(trades, resolutions, 0.25, opts.leagueFor, phase));
  const pregame = summariseEdge(priceEdge(phasePicks("pregame"), edgeOpts));
  const inplay = summariseEdge(priceEdge(phasePicks("inplay"), edgeOpts));
  const all = phasePicks("all");

  const snipePicks = onePickPerMarket(tradesToSnipePicks(trades, resolutions, 0.25, opts.leagueFor));
  const resolved = new Set<string>();
  for (const t of trades) if (resolutions.get(t.conditionId) && t.size > 0 && t.price > 0 && t.price < 1) resolved.add(t.conditionId);
  // Markets whose only bets were unscorable (50-50 resolutions) do not count as resolved bets.
  const scorable = new Set<string>([...all.map((p) => p.marketId), ...snipePicks.map((p) => p.marketId)]);
  const resolvedMarkets = scorable.size;
  const sniping: SnipingSummary = {
    markets: snipePicks.length,
    resolvedMarkets,
    share: resolvedMarkets > 0 ? snipePicks.length / resolvedMarkets : 0,
    edge: summariseEdge(priceEdge(snipePicks, edgeOpts)),
  };

  const byLeague = new Map<string, CategorisedPick[]>();
  for (const p of all) byLeague.set(p.league, [...(byLeague.get(p.league) ?? []), p]);
  const leagues: LeagueAudit[] = [...byLeague]
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .slice(0, opts.topLeagues ?? 5)
    .map(([league, picks]) => ({ league, ...summariseEdge(priceEdge(picks, edgeOpts)) }));

  return {
    n: all.length,
    pregame,
    inplay,
    sniping,
    leagues,
    verdict: overallVerdict([pregame, inplay]),
    flags: sniping.share > MOSTLY_SNIPING_SHARE ? ["mostly sniping"] : [],
    trades: trades.length,
    tradesInResolvedMarkets: trades.filter((t) => resolved.has(t.conditionId)).length,
  };
}
