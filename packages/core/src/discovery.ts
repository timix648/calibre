import { leagueOf } from "./wording.js";
import type { PricePoint } from "./moves.js";

/** The fields of a Tatum event that market discovery needs. */
export interface EventLike {
  id: string;
  title: string;
  status: string;
  closeTime: string;
  totalVolume: number;
  markets: string[];
  source?: { platformId?: string };
}

export interface Candidate {
  marketId: string;
  eventId: string;
  eventTitle: string;
  /** The platform's event slug, e.g. `cs2-mglz-hero-2026-11-03`. */
  slug: string;
  league: string;
  closeTime: string;
}

/** Aggregate side-market events whose single markets are rarely traded on their own. */
const SIDE_EVENT = /-(more-markets|exact-score)$/;

/**
 * Markets worth checking for a move right now: active events that close within the window
 * (games in play or about to start), busiest first. Events with a handful of markets contribute all
 * of them; larger events contribute their first two. Tatum's `endingSoon` sort lists long-finished
 * events first, so the window is applied here instead.
 */
export function selectCandidates(
  events: EventLike[],
  opts: { now: number; maxMarkets: number; pastHours?: number; aheadHours?: number },
): Candidate[] {
  const from = opts.now - (opts.pastHours ?? 8) * 3_600_000;
  const to = opts.now + (opts.aheadHours ?? 36) * 3_600_000;
  const seen = new Set<string>();
  const live = events
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      const close = Date.parse(e.closeTime);
      const slug = e.source?.platformId ?? "";
      return e.status === "active" && close >= from && close <= to && !SIDE_EVENT.test(slug) && e.markets.length > 0;
    })
    .sort((a, b) => b.totalVolume - a.totalVolume);
  const out: Candidate[] = [];
  for (const e of live) {
    const slug = e.source?.platformId ?? e.id;
    for (const marketId of e.markets.slice(0, e.markets.length <= 4 ? 4 : 2)) {
      if (out.length >= opts.maxMarkets) return out;
      out.push({ marketId, eventId: e.id, eventTitle: e.title, slug, league: leagueOf(slug), closeTime: e.closeTime });
    }
  }
  return out;
}

/** Price points from Tatum candles (close price), oldest first. */
export function candlePoints(candles: { timestamp: string; close: number }[]): PricePoint[] {
  return candles
    .map((c) => ({ ts: Date.parse(c.timestamp), close: c.close }))
    .filter((p) => Number.isFinite(p.ts) && Number.isFinite(p.close))
    .sort((a, b) => a.ts - b.ts);
}
