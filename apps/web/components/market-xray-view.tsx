"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MarketXray, TakerXray } from "@calibre/public-data";
import { ErrorPanel, failureCode, type FailureCode } from "./error-panel";
import { LoadingNote, MarketSkeleton } from "./skeletons";
import { GaugeLegend, SquareGauge } from "./square-gauge";
import { SquareBar, XrayChip } from "./xray-ui";
import { Badge, Card, ExternalLink, H2, Stat, TableWrap } from "./ui";
import { pct, shortAddr, span, usd } from "@/lib/format";
import { SourceStrip } from "./source-strip";
import { gaugeZone } from "@/lib/gauge";

type Reply = { ok: true; cached: boolean; result: MarketXray } | { ok: false; code: string; error: string };
type State = { kind: "loading" } | { kind: "error"; code: FailureCode; message?: string; retryable: boolean; retryAfter: number | null } | { kind: "done"; result: MarketXray; cached: boolean };

export function MarketXrayView({ refParam, marketParam }: { refParam: string; marketParam: string | null }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    setState({ kind: "loading" });
    try {
      const url = `/api/xray/market/${encodeURIComponent(refParam)}${marketParam ? `?market=${encodeURIComponent(marketParam)}` : ""}`;
      const res = await fetch(url, { signal });
      const body = (await res.json().catch(() => null)) as Reply | null;
      if (!body) throw new Error("bad reply");
      if (!body.ok) {
        const wait = Number(res.headers.get("Retry-After"));
        setState({ kind: "error", code: failureCode(body.code), message: body.error, retryable: !["bad_ref", "not_found"].includes(body.code), retryAfter: Number.isFinite(wait) && wait > 0 ? wait : null });
      } else setState({ kind: "done", result: body.result, cached: body.cached });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ kind: "error", code: "network", retryable: true, retryAfter: null });
    }
  }, [refParam, marketParam]);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load, attempt]);

  if (state.kind === "loading") {
    return (
      <div className="space-y-6">
        <LoadingNote what="Reading the market's recent fills and auditing the biggest wallets behind the move" usually="5 to 25 s" />
        <MarketSkeleton />
      </div>
    );
  }
  if (state.kind === "error") {
    return <ErrorPanel code={state.code} message={state.message} retryAfter={state.retryAfter} {...(state.retryable ? { onRetry: () => setAttempt((n) => n + 1) } : {})} />;
  }
  return <Result r={state.result} cached={state.cached} onRefresh={() => setAttempt((n) => n + 1)} />;
}

function Result({ r, cached, onRefresh }: { r: MarketXray; cached: boolean; onRefresh: () => void }) {
  const m = r.move;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold leading-snug tracking-tight">{r.market.question}</h2>
        <p className="mt-1 text-sm text-muted">
          <ExternalLink href={r.market.url}>Open on Polymarket</ExternalLink>
          {" · "}
          {cached ? "Cached, under 10 min old" : "Live"}
          {r.market.closed ? " · market closed" : ""}
        </p>
        <div className="mt-3"><SourceStrip anchor={r.anchor} fills={r.source} /></div>
      </div>

      {!r.complete ? (
        <div role="status" className="flex flex-wrap items-center gap-3 cut bg-warn/10 px-4 py-3 text-sm text-warn">
          <span>Partial result: some wallet audits were still running when the time ran out, so those takers are not judged yet.</span>
          <button onClick={onRefresh} className="rounded-lg border border-warn/40 px-3 py-1 hover:bg-warn/10">Check again</button>
        </div>
      ) : null}

      <MoveCard r={r} />

      {m ? (
        <>
          <SquareCard r={r} />
          <TakersCard r={r} />
        </>
      ) : null}

      <p className="text-xs leading-relaxed text-faint">{r.caution}</p>
    </div>
  );
}

function MoveCard({ r }: { r: MarketXray }) {
  const m = r.move;
  const yes = r.market.yesOutcome;
  if (!m) {
    return (
      <Card>
        <H2>Latest move</H2>
        <p className="text-sm leading-relaxed">
          <span className="text-fg">{r.noMoveReason}</span>
        </p>
        <p className="mt-2 text-sm text-muted">
          {r.market.yesPrice !== null ? <>{yes} is priced at <span className="num text-fg">{pct(r.market.yesPrice)}</span>. </> : null}
          Read {r.fills.read} fills{r.fills.oldestTs ? ` back to ${new Date(r.fills.oldestTs).toISOString().slice(0, 16).replace("T", " ")} UTC` : ""}.
        </p>
      </Card>
    );
  }
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="The move">
      <Stat label={`${yes} price`} value={`${pct(m.from)} → ${pct(m.to)}`} note={`${m.points >= 0 ? "+" : "-"}${Math.abs(m.points).toFixed(1)} pts, ${m.direction}`} />
      <Stat label="Took" value={span(m.endTs - m.startTs)} note={`ended ${span(Date.now() - m.endTs)} ago`} />
      <Stat label="Fills in the move" value={m.fills.toLocaleString("en-US")} note={`${r.fills.read} read in ${r.fills.pages} page${r.fills.pages === 1 ? "" : "s"}`} />
      <Stat label="Pushed by" value={r.squareMoney ? `${r.squareMoney.wallets} wallets` : "n/a"} note={`${usd(r.squareMoney?.alignedUsd ?? 0)} on ${m.direction === "up" ? yes : r.market.noOutcome}`} />
      {m.settling ? (
        <p className="col-span-full cut bg-white/[0.035] px-4 py-3 text-sm text-muted">
          The price ended at a decided level (97 cents or more, or 3 cents or less). This looks like the market settling on a result, not repricing.
        </p>
      ) : null}
    </section>
  );
}

function SquareCard({ r }: { r: MarketXray }) {
  const s = r.squareMoney;
  if (!s) return null;
  const zone = gaugeZone(s.share);
  return (
    <Card>
      <H2 sub="Share of the money pushing the move that came from wallets with a proven losing record (overall z of -2 or lower over at least 30 bets).">Square money</H2>
      <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:gap-10">
        <div className="mx-auto w-full max-w-[320px]">
          <SquareGauge share={s.share} coverage={s.coverage} />
          <p className="num mt-1 text-center text-xs text-muted">
            Judged <span className="text-fg">{pct(s.coverage)}</span> of the pushing money
          </p>
        </div>
        <div>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs text-faint">Of the judged money</dt>
              <dd className="num text-xl font-semibold">{s.shareOfJudged === null ? "n/a" : pct(s.shareOfJudged)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Of all pushing money</dt>
              <dd className="num text-xl font-semibold" style={{ color: zone.color }}>{pct(s.share)}</dd>
            </div>
            <div>
              <dt className="text-xs text-faint">Coverage</dt>
              <dd className="num text-xl font-semibold">{pct(s.coverage)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-muted">{s.note}</p>
        </div>
      </div>
      <details className="mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer text-xs text-muted hover:text-fg">How to read the gauge, and the money split</summary>
        <div className="mt-3 space-y-4">
          <GaugeLegend />
          <SquareBar share={s.share} coverage={s.coverage} />
        </div>
      </details>
    </Card>
  );
}

function TakersCard({ r }: { r: MarketXray }) {
  const price = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <Card>
      <H2 sub={`The biggest wallets pushing the move, with the X-ray of their own record. Open a wallet for its full audit.`}>Who pushed it</H2>
      <ul className="space-y-2 sm:hidden">
        {r.takers.map((t) => <TakerCard key={t.address} t={t} />)}
      </ul>
      <div className="hidden sm:block">
      <TableWrap>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="py-2 pr-3 font-medium">Wallet</th>
              <th className="px-3 py-2 font-medium">Bet on</th>
              <th className="px-3 py-2 text-right font-medium">Net bet</th>
              <th className="px-3 py-2 font-medium">X-ray</th>
              <th className="px-3 py-2 text-right font-medium">z</th>
              <th className="py-2 pl-3 text-right font-medium">Bets</th>
            </tr>
          </thead>
          <tbody>
            {r.takers.map((t) => <TakerRow key={t.address} t={t} price={price} />)}
          </tbody>
        </table>
      </TableWrap>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Only the top {r.takers.length} takers by money are judged. A proven winning record is rare and modest in testing (+2.2 pts per bet next); a proven losing record lost again (-3.8 pts).
      </p>
    </Card>
  );
}

function TakerRow({ t, price }: { t: TakerXray; price: (p: number) => string }) {
  return (
    <tr className="border-b border-line/60 align-top">
      <td className="py-2.5 pr-3">
        <Link href={`/wallet/${t.address}`} className="num text-accent underline decoration-accent/40">{shortAddr(t.address)}</Link>
        {t.name && !t.name.startsWith("0x") ? <div className="max-w-[12rem] truncate text-xs text-faint">{t.name}</div> : null}
      </td>
      <td className="px-3 py-2.5 text-muted">{t.pushed}<span className="num block text-xs text-faint">avg {price(t.avgYesPrice)} YES</span></td>
      <td className="num px-3 py-2.5 text-right">{usd(t.netUsd)}</td>
      <td className="px-3 py-2.5">
        {t.status === "audited" ? <XrayChip label={t.label} compact /> : <Badge tone="warn">{t.status === "pending" ? "Still auditing" : "Audit failed"}</Badge>}
      </td>
      <td className="num px-3 py-2.5 text-right text-muted">{t.audit ? t.audit.z.toFixed(1) : "n/a"}</td>
      <td className="num py-2.5 pl-3 text-right text-muted">{t.audit ? t.audit.n : "n/a"}</td>
    </tr>
  );
}

function TakerCard({ t }: { t: TakerXray }) {
  return (
    <li className="cut bg-white/[0.035] p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/wallet/${t.address}`} className="num text-sm text-accent underline decoration-accent/40">{shortAddr(t.address)}</Link>
          {t.name && !t.name.startsWith("0x") ? <div className="max-w-[10rem] truncate text-xs text-faint">{t.name}</div> : null}
        </div>
        <div className="shrink-0 text-right">
          {t.status === "audited" ? <XrayChip label={t.label} compact /> : <Badge tone="warn">{t.status === "pending" ? "Still auditing" : "Audit failed"}</Badge>}
        </div>
      </div>
      <div className="num mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <span>{usd(t.netUsd)} on {t.pushed}</span>
        {t.audit ? <span>z {t.audit.z.toFixed(1)}</span> : null}
        {t.audit ? <span>{t.audit.n} bets</span> : null}
      </div>
    </li>
  );
}
