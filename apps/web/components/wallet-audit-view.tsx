"use client";

import { useCallback, useEffect, useState } from "react";
import type { AuditVerdict, EdgeSummary } from "@calibre/core";
import type { WalletAuditResult } from "@calibre/public-data";
import { EdgeBar } from "./edge-bar";
import { Badge, Card, H2, Stat, TableWrap } from "./ui";
import { VERDICT_TONE, pct, pts, utc } from "@/lib/format";

type ApiReply =
  | { ok: true; cached: boolean; result: WalletAuditResult }
  | { ok: false; code: string; error: string };

type State = { kind: "loading" } | { kind: "error"; message: string; retryable: boolean } | { kind: "done"; result: WalletAuditResult; cached: boolean };

export function verdictSentence(e: EdgeSummary): string {
  const edge = `${pts(e.edge)} points`;
  switch (e.verdict) {
    case "proven edge":
      return `Its bets won ${edge} more often than the prices it paid implied, over ${e.n} bets (z ${e.z.toFixed(1)}). That is unlikely to be luck. It does not show the edge will continue.`;
    case "negative edge":
      return `Its bets won ${pts(Math.abs(e.edge))} points less often than the prices it paid implied, over ${e.n} bets (z ${e.z.toFixed(1)}). That is unlikely to be luck.`;
    case "too early":
      return e.n === 0 ? "No scored bets in this phase." : `Only ${e.n} scored bets, fewer than 30: too early to call.`;
    default:
      return `A measured edge of ${edge} over ${e.n} bets is within what luck produces (z ${e.z.toFixed(1)}), and the error band includes zero or the sample is under 100 bets.`;
  }
}

export function WalletAuditView({ address }: { address: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/wallet/${address}`, { signal });
      const body = (await res.json().catch(() => null)) as ApiReply | null;
      if (!body) throw new Error("bad reply");
      if (!body.ok) setState({ kind: "error", message: body.error, retryable: body.code !== "bad_address" });
      else setState({ kind: "done", result: body.result, cached: body.cached });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ kind: "error", message: "The audit could not be reached. Check your connection and try again.", retryable: true });
    }
  }, [address]);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load, attempt]);

  if (state.kind === "loading") return <Loading />;
  if (state.kind === "error") {
    return (
      <Card>
        <p role="alert" className="text-sm leading-relaxed text-bad">{state.message}</p>
        {state.retryable ? (
          <button onClick={() => setAttempt((n) => n + 1)} className="mt-4 rounded-lg border border-line bg-panel-2 px-3.5 py-2 text-sm hover:border-accent">
            Try again
          </button>
        ) : null}
      </Card>
    );
  }
  return <Result r={state.result} cached={state.cached} />;
}

function Loading() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-sm text-muted">Reading this wallet&apos;s trades and their results from Polymarket. This takes a few seconds.</p>
      {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-panel" />)}
    </div>
  );
}

function Result({ r, cached }: { r: WalletAuditResult; cached: boolean }) {
  const a = r.audit;
  if (r.tradesFetched === 0) {
    return (
      <Card>
        <H2>No trades found</H2>
        <p className="text-sm leading-relaxed text-muted">
          Polymarket&apos;s public API has no trades for this address. It may be a new wallet, or an address that holds funds but has not traded.
          Note that Polymarket accounts trade through a proxy wallet: use the address shown on the account&apos;s profile page.
        </p>
      </Card>
    );
  }
  if (a.n === 0 && a.sniping.markets === 0) {
    return (
      <div className="space-y-6">
        <Header r={r} cached={cached} />
        <Card>
          <H2>Nothing to score yet</H2>
          <p className="text-sm leading-relaxed text-muted">
            This wallet has {r.tradesFetched} trades, but none are in a resolved market with a clean winner, so there is no record to audit yet.
          </p>
        </Card>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Header r={r} cached={cached} />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Verdict</h2>
          <Badge tone={VERDICT_TONE[a.verdict]}>{a.verdict}</Badge>
          {a.flags.map((f) => <Badge key={f} tone="warn">{f}</Badge>)}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted">{overallSentence(a.verdict)}</p>
        {a.flags.includes("mostly sniping") ? (
          <p className="mt-2 text-sm leading-relaxed text-warn">
            {pct(a.sniping.share)} of this wallet&apos;s resolved bets were placed at 97 cents or more, or 3 cents or less, when the outcome was effectively decided. That earns a steady sliver that looks like skill but is not forecasting.
          </p>
        ) : null}
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <PhaseCard title="Pre-game" blurb="Bets placed before the game or event started. This is forecasting." e={a.pregame} />
        <PhaseCard title="In-play" blurb="Bets placed once it was live, or in the last 3 hours before the close. This is reaction speed." e={a.inplay} />
      </div>

      <Card>
        <H2 sub="Bets at 97 cents or more, or 3 cents or less, buy an outcome that is already almost decided. They are set apart and never counted as an edge.">Sniping</H2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Share of resolved bets" value={pct(a.sniping.share, 1)} note={`${a.sniping.markets} of ${a.sniping.resolvedMarkets} markets`} />
          <Stat label="Edge on those bets" value={a.sniping.edge.n > 0 ? `${pts(a.sniping.edge.edge)} pts` : "n/a"} note={a.sniping.edge.n > 0 ? `z ${a.sniping.edge.z.toFixed(1)}` : "no sniping bets"} />
          <Stat label="Counted in the verdict" value="No" note="Excluded from pre-game and in-play edge" />
        </div>
      </Card>

      {a.leagues.length > 0 ? (
        <Card>
          <H2 sub="The five leagues or categories with the most scored bets, both phases together.">By league</H2>
          <TableWrap>
            <table className="w-full min-w-[620px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">League</th>
                  <th className="px-3 py-2 text-right font-medium">Bets</th>
                  <th className="px-3 py-2 font-medium">Edge, ± 2 standard errors</th>
                  <th className="px-3 py-2 text-right font-medium">z</th>
                  <th className="py-2 pl-3 font-medium">Call</th>
                </tr>
              </thead>
              <tbody>
                {a.leagues.map((l) => (
                  <tr key={l.league} className="border-b border-line/60">
                    <td className="py-2.5 pr-3 font-medium uppercase">{l.league}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{l.n}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <EdgeBar edge={l.edge} low={l.low} high={l.high} />
                        <span className="num whitespace-nowrap text-xs text-muted">{pts(l.edge)} ± {l.se === null ? "n/a" : (2 * l.se * 100).toFixed(1)}</span>
                      </div>
                    </td>
                    <td className="num px-3 py-2.5 text-right text-muted">{l.z.toFixed(1)}</td>
                    <td className="py-2.5 pl-3"><Badge tone={VERDICT_TONE[l.verdict]}>{short(l.verdict)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      ) : null}

      <Card>
        <H2>How to read this</H2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>Edge is how much more often a wallet&apos;s bets won than the prices it paid implied. +3 points means 3 more wins per 100 bets than the prices said.</li>
          <li>The bar shows edge with a band of 2 standard errors. If the band crosses the dashed zero line, the record is consistent with luck.</li>
          <li>A &quot;proven edge&quot; needs z of 2 or more and at least 100 bets in a phase. Under 30 bets is too early to call whatever the numbers say.</li>
          <li>One bet per market is counted; sells are scored as a bet on the other side. Only the newest 1,000 trades are read{r.truncated ? ", and this wallet has more" : ""}.</li>
        </ul>
      </Card>
    </div>
  );
}

const short = (v: AuditVerdict) => (v === "no proven edge (consistent with luck)" ? "no proven edge" : v);

function overallSentence(v: AuditVerdict): string {
  switch (v) {
    case "proven edge": return "In at least one phase this wallet beat its prices by more than luck explains, over a long enough record. A past record still does not guarantee a future one.";
    case "negative edge": return "This wallet lost to its prices by more than luck explains.";
    case "too early": return "Fewer than 30 scored bets in each phase: too early to say anything either way.";
    default: return "Nothing in this wallet's record separates it from luck. It may be skilled or unskilled; there is not enough evidence to tell.";
  }
}

function Header({ r, cached }: { r: WalletAuditResult; cached: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Trades read" value={r.tradesFetched.toLocaleString("en-US")} note={r.truncated ? "Newest 1,000 of more" : "Whole history"} />
      <Stat label="Scored bets" value={r.audit.n.toLocaleString("en-US")} note={`${r.audit.tradesInResolvedMarkets} trades in resolved markets`} />
      <Stat label="First trade read" value={r.firstTradeAt ? utc(r.firstTradeAt * 1000).slice(0, 10) : "n/a"} note={r.lastTradeAt ? `Latest ${utc(r.lastTradeAt * 1000).slice(0, 10)}` : undefined} />
      <Stat label="Source" value="Polymarket" note={cached ? "Cached, under 10 min old" : "Live"} />
    </div>
  );
}

function PhaseCard({ title, blurb, e }: { title: string; blurb: string; e: EdgeSummary }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <Badge tone={VERDICT_TONE[e.verdict]}>{short(e.verdict)}</Badge>
      </div>
      <p className="mt-1 text-xs text-faint">{blurb}</p>
      <div className="mt-4">
        <EdgeBar edge={e.edge} low={e.low} high={e.high} range={0.3} />
        <div className="num mt-1 flex justify-between text-[10px] text-faint" aria-hidden><span>-30</span><span>0</span><span>+30 pts</span></div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-faint">Edge</dt><dd className="num font-semibold">{e.n > 0 ? `${pts(e.edge)}` : "n/a"}</dd></div>
        <div><dt className="text-xs text-faint">± 2 SE</dt><dd className="num">{e.se === null ? "n/a" : (2 * e.se * 100).toFixed(1)}</dd></div>
        <div><dt className="text-xs text-faint">Bets</dt><dd className="num">{e.n}</dd></div>
      </dl>
      <p className="mt-3 text-sm leading-relaxed text-muted">{verdictSentence(e)}</p>
    </Card>
  );
}
