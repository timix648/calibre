"use client";

import { useCallback, useEffect, useState } from "react";
import { XRAY_SUBTITLE, type AuditVerdict, type EdgeSummary } from "@calibre/core";
import type { WalletXray } from "@calibre/public-data";
import { EdgeBar } from "./edge-bar";
import { LuckLegend, PhaseEdgeChart } from "./edge-chart";
import { ErrorPanel, failureCode, type FailureCode } from "./error-panel";
import { LoadingNote, WalletSkeleton } from "./skeletons";
import { Badge, Card, H2, TableWrap } from "./ui";
import { LABEL_MEANING, XrayChip } from "./xray-ui";
import { VERDICT_TONE, pct, pts, utc } from "@/lib/format";
import { edgeRange } from "@/lib/gauge";

type ApiReply =
  | { ok: true; cached: boolean; result: WalletXray }
  | { ok: false; code: string; error: string };

type State = { kind: "loading" } | { kind: "error"; code: FailureCode; message?: string; retryable: boolean; retryAfter: number | null } | { kind: "done"; result: WalletXray; cached: boolean };

export function WalletAuditView({ address }: { address: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/xray/wallet/${address}`, { signal });
      const body = (await res.json().catch(() => null)) as ApiReply | null;
      if (!body) throw new Error("bad reply");
      if (!body.ok) {
        const wait = Number(res.headers.get("Retry-After"));
        setState({ kind: "error", code: failureCode(body.code), message: body.error, retryable: body.code !== "bad_address", retryAfter: Number.isFinite(wait) && wait > 0 ? wait : null });
      } else setState({ kind: "done", result: body.result, cached: body.cached });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ kind: "error", code: "network", retryable: true, retryAfter: null });
    }
  }, [address]);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load, attempt]);

  if (state.kind === "loading") return <Loading />;
  if (state.kind === "error") {
    return <ErrorPanel code={state.code} message={state.message} retryAfter={state.retryAfter} {...(state.retryable ? { onRetry: () => setAttempt((n) => n + 1) } : {})} />;
  }
  return <Result r={state.result} cached={state.cached} />;
}

function Loading() {
  return (
    <div className="space-y-6">
      <LoadingNote what="Reading this wallet's trades and their results from Polymarket" usually="3 to 10 s" />
      <WalletSkeleton />
    </div>
  );
}

const short = (v: AuditVerdict) => (v === "no proven edge (consistent with luck)" ? "no proven edge" : v);

function Result({ r, cached }: { r: WalletXray; cached: boolean }) {
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
  const scored = a.n > 0 || a.sniping.markets > 0;
  const range = edgeRange([a.overall, a.pregame, a.inplay]);
  return (
    <div className="space-y-6">
      <Card className="border-line">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-sm text-faint">X-ray</span>
          <span className="text-base"><XrayChip label={r.xray.label} /></span>
          {r.name && !r.name.startsWith("0x") ? <span className="text-sm text-muted">{r.name}</span> : null}
        </div>
        <p className="mt-3 text-sm text-muted">Wallets with this label: {XRAY_SUBTITLE[r.xray.label]}.</p>
        <p className="mt-3 text-xl font-medium leading-snug tracking-tight sm:text-2xl">{r.xray.sentence}</p>
        {r.xray.caveat ? <p className="mt-3 text-sm leading-relaxed text-warn">{r.xray.caveat}</p> : null}
        {!r.xray.reliable && !r.xray.caveat ? (
          <p className="mt-3 text-xs leading-relaxed text-faint">{LABEL_MEANING[r.xray.label]}</p>
        ) : null}

        <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-4">
          <Fact label="Scored bets" value={a.n.toLocaleString("en-US")} note={`${a.tradesInResolvedMarkets} trades in resolved markets`} />
          <Fact
            label="Edge, overall"
            value={a.overall.n > 0 ? `${pts(a.overall.edge)} ± ${a.overall.se === null ? "n/a" : (2 * a.overall.se * 100).toFixed(1)}` : "n/a"}
            note={a.overall.n > 0 ? `z ${a.overall.z.toFixed(1)}, points per bet` : "no scored bets"}
          />
          <Fact label="Sniping share" value={pct(a.sniping.share)} note={`${a.sniping.markets} of ${a.sniping.resolvedMarkets} resolved markets`} />
          <Fact
            label="Trades read"
            value={r.tradesFetched.toLocaleString("en-US")}
            note={`${r.truncated ? "Newest 1,000 of more" : "Whole history"} · ${cached ? "cached" : "live"}`}
          />
        </dl>
      </Card>

      {scored ? (
        <>
          <Card>
            <H2 sub="Bets scored against the price paid, one per market, in points per bet. The dot is the wallet's edge and the bar is two standard errors either side. If the bar sits inside the shaded luck band, the record cannot be told apart from luck.">
              Edge, with error bars
            </H2>
            <div className="space-y-6">
              <PhaseRow title="All bets" blurb="Pre-game and in-play together. This is what the label reads." e={a.overall} range={range} />
              <PhaseRow title="Pre-game" blurb="Placed before the game or event started: forecasting." e={a.pregame} range={range} />
              <PhaseRow title="In-play" blurb="Placed once it was live, or in the last 3 hours before the close: reaction speed." e={a.inplay} range={range} />
            </div>
            <div className="mt-5 border-t border-line pt-4"><LuckLegend /></div>
          </Card>

          <Card>
            <H2 sub="Bets at 97 cents or more, or 3 cents or less buy an outcome that is already almost decided. They are set apart and never counted as an edge.">Sniping</H2>
            <div className="flex items-center gap-4">
              <div className="num text-3xl font-semibold">{pct(a.sniping.share)}</div>
              <div className="min-w-0 flex-1">
                <div className="h-2.5 overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`${pct(a.sniping.share)} of resolved bets were sniping`}>
                  <div className={`h-full ${a.sniping.share > 0.4 ? "bg-warn" : "bg-faint"}`} style={{ width: `${Math.min(100, a.sniping.share * 100)}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-muted">
                  of {a.sniping.resolvedMarkets} resolved markets; edge on those bets {a.sniping.edge.n > 0 ? `${pts(a.sniping.edge.edge)} pts (z ${a.sniping.edge.z.toFixed(1)})` : "n/a"}.
                  More than 40% is flagged as mostly sniping.
                </p>
              </div>
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
        </>
      ) : (
        <Card>
          <H2>Nothing to score yet</H2>
          <p className="text-sm leading-relaxed text-muted">
            This wallet has {r.tradesFetched} trades, but none are in a resolved market with a clean winner, so there is no record to audit yet.
          </p>
        </Card>
      )}

      <Card>
        <H2>How to read this</H2>
        <ul className="space-y-2 text-sm leading-relaxed text-muted">
          <li>Edge is how much more often a wallet&apos;s bets won than the prices it paid implied. +3 points means 3 more wins per 100 bets than the prices said.</li>
          <li>The labels were tested on 1,000 wallets: the label a wallet had from its older bets, then how it did on its newer ones. A <strong className="text-fg">proven losing record</strong> lost again (-3.8 pts per bet next, 81% of wallets); the rare <strong className="text-fg">proven winning record</strong> stayed ahead modestly (+2.2 pts). See the method page.</li>
          <li>The labels: proven losing record (z of -2 or lower, 30+ bets), mostly sniping (over 40% decided-price bets), too early (under 30 bets), proven winning record (z of 2 or more, 100+ bets), otherwise no proven edge.</li>
          <li>One bet per market is counted; sells are scored as a bet on the other side. Only the newest 1,000 trades are read{r.truncated ? ", and this wallet has more" : ""}. Read {utc(r.firstTradeAt ? r.firstTradeAt * 1000 : null).slice(0, 10)} to {utc(r.lastTradeAt ? r.lastTradeAt * 1000 : null).slice(0, 10)}.</li>
        </ul>
      </Card>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-faint">{label}</dt>
      <dd className="num mt-1 text-xl font-semibold">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-muted">{note}</dd> : null}
    </div>
  );
}

function PhaseRow({ title, blurb, e, range }: { title: string; blurb: string; e: EdgeSummary; range: number }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[11rem_1fr] sm:gap-6">
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-xs text-faint">{blurb}</div>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-lg font-semibold">
            {e.n > 0 ? <>{pts(e.edge)} <span className="text-sm font-normal text-muted">± {e.se === null ? "n/a" : (2 * e.se * 100).toFixed(1)} pts</span></> : <span className="text-muted">n/a</span>}
          </span>
          <span className="num text-xs text-muted">{e.n} bets, z {e.z.toFixed(1)}</span>
          <Badge tone={VERDICT_TONE[e.verdict]}>{short(e.verdict)}</Badge>
        </div>
        <PhaseEdgeChart edge={e.edge} low={e.low} high={e.high} range={range} />
      </div>
    </div>
  );
}
