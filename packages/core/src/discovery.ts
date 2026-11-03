import { leagueOf } from "./leagues.js";
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
  tags?: string[];
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

/** The category CALIBRE files US election markets under, whatever the first word of a market slug is. */
export const POLITICS = "politics";

/** `politics` when an event's tags include Polymarket's politics tag, otherwise null. */
export function categoryFromTags(tags: string[] | undefined): typeof POLITICS | null {
  return tags?.some((t) => t.toLowerCase() === POLITICS) ? POLITICS : null;
}

/** An active event tagged as a midterm race (control of Congress, Senate, governor, ballot measure) that closes soon. */
export function isMidtermEvent(e: EventLike, now: number, opts: { aheadDays?: number; pastHours?: number } = {}): boolean {
  const close = Date.parse(e.closeTime);
  const from = now - (opts.pastHours ?? 24) * 3_600_000;
  const to = now + (opts.aheadDays ?? 14) * 86_400_000;
  return e.status === "active" && close >= from && close <= to && e.markets.length > 0 &&
    (e.tags ?? []).some((t) => t.toLowerCase().includes("midterm"));
}

/**
 * Markets of the 2026 midterm events closing within the next days, busiest event first, `perEvent` markets from each
 * (events list their markets in order of importance, so the first ones are the headline contests).
 * They are filed under the politics category.
 */
export function selectMidtermCandidates(
  events: EventLike[],
  opts: { now: number; maxMarkets: number; perEvent?: number; aheadDays?: number },
): Candidate[] {
  const seen = new Set<string>();
  const live = events
    .filter((e) => !seen.has(e.id) && seen.add(e.id) && isMidtermEvent(e, opts.now, { aheadDays: opts.aheadDays }))
    .sort((a, b) => b.totalVolume - a.totalVolume);
  const out: Candidate[] = [];
  for (const e of live) {
    for (const marketId of e.markets.slice(0, opts.perEvent ?? 2)) {
      if (out.length >= opts.maxMarkets) return out;
      out.push({ marketId, eventId: e.id, eventTitle: e.title, slug: e.source?.platformId ?? e.id, league: POLITICS, closeTime: e.closeTime });
    }
  }
  return out;
}
