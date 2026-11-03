import type { EdgeSummary } from "@calibre/core";
import type { WalletAuditResult } from "@calibre/public-data";

const pts = (p: number | null) => (p === null || !Number.isFinite(p) ? "n/a" : `${p >= 0 ? "+" : "-"}${Math.abs(p * 100).toFixed(1)}`);

function phaseLine(name: string, e: EdgeSummary): string {
  if (e.n === 0) return `${name}: no scored bets (${e.verdict})`;
  return `${name}: edge ${pts(e.edge)} pts, band ${pts(e.low)} to ${pts(e.high)} (edge ± 2 standard errors), z ${e.z.toFixed(2)}, ${e.n} bets: ${e.verdict}`;
}

/** The audit as a short plain-text report an assistant can quote. */
export function auditReport(r: WalletAuditResult): string {
  const a = r.audit;
  const lines = [
    `Wallet ${r.address}${r.name ? ` (${r.name})` : ""}`,
    `Verdict: ${a.verdict}${a.flags.length ? ` [${a.flags.join(", ")}]` : ""}`,
    `Trades read: ${r.tradesFetched}${r.truncated ? " (newest 1,000 of more)" : ""}; scored bets: ${a.n}`,
    phaseLine("Pre-game", a.pregame),
    phaseLine("In-play", a.inplay),
    `Sniping (bets at 97c or more, or 3c or less): ${(a.sniping.share * 100).toFixed(1)}% of ${a.sniping.resolvedMarkets} resolved markets` +
      (a.sniping.edge.n > 0 ? `, edge ${pts(a.sniping.edge.edge)} pts` : ""),
    ...(a.leagues.length ? ["By league:", ...a.leagues.map((l) => `  ${l.league.toUpperCase()}: ${l.n} bets, edge ${pts(l.edge)} pts, z ${l.z.toFixed(2)}, ${l.verdict}`)] : []),
    "Rules: proven edge needs z of 2 or more over at least 100 bets in a phase; under 30 bets is too early; a past record does not predict a future one.",
    `Source: Polymarket public API, fetched ${r.fetchedAt}`,
  ];
  return lines.join("\n");
}
