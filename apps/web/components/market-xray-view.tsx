"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MarketXray, TakerXray } from "@calibre/public-data";
import { SquareBar, XrayChip } from "./xray-ui";
import { Badge, Card, ExternalLink, H2, Stat, TableWrap } from "./ui";
import { pct, shortAddr, span, usd } from "@/lib/format";

type Reply = { ok: true; cached: boolean; result: MarketXray } | { ok: false; code: string; error: string };
type State = { kind: "loading" } | { kind: "error"; message: string; retryable: boolean } | { kind: "done"; result: MarketXray; cached: boolean };

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
      if (!body.ok) setState({ kind: "error", message: body.error, retryable: !["bad_ref", "not_found"].includes(body.code) });
      else setState({ kind: "done", result: body.result, cached: body.cached });
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setState({ kind: "error", message: "The X-ray could not be reached. Check your connection and try again.", retryable: true });
    }
  }, [refParam, marketParam]);

  useEffect(() => {
    const ctl = new AbortController();
    void load(ctl.signal);
    return () => ctl.abort();
  }, [load, attempt]);

  if (state.kind === "loading") {
    return (
      <div role="status" aria-live="polite" className="space-y-4">
        <p className="text-sm text-muted">Reading the market&apos;s recent fills and auditing the biggest takers behind the move. This can take up to 25 seconds.</p>
        {[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl border border-line bg-panel" />)}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <Card>
        <p role="alert" className="text-sm leading-relaxed text-bad">{state.message}</p>
        {state.retryable ? (
          <button onClick={() => setAttempt((n) => n + 1)} className="mt-4 rounded-lg border border-line bg-panel-2 px-3.5 py-2 text-sm hover:border-accent">Try again</button>
        ) : null}
      </Card>
    );
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
      </div>

      {!r.complete ? (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm text-warn">
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
          <strong>No recent move.</strong> <span className="text-muted">{r.noMoveReason}</span>
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
        <p className="col-span-full rounded-lg border border-line bg-panel-2 px-4 py-3 text-sm text-muted">
          The price ended at a decided level (97 cents or more, or 3 cents or less). This looks like the market settling on a result, not repricing.
        </p>
      ) : null}
    </section>
  );
}

function SquareCard({ r }: { r: MarketXray }) {
  const s = r.squareMoney;
  if (!s) return null;
  return (
    <Card>
      <H2 sub="Share of the money pushing the move that came from wallets with a proven losing record (overall z of -2 or lower over at least 30 bets).">Square money</H2>
      <SquareBar share={s.share} coverage={s.coverage} />
      <dl className="mt-4 grid grid-cols-3 gap-3">
        <div>
          <dt className="text-xs text-faint">Of the judged money</dt>
          <dd className="num text-xl font-semibold">{s.shareOfJudged === null ? "n/a" : pct(s.shareOfJudged)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Of all pushing money</dt>
          <dd className="num text-xl font-semibold">{pct(s.share)}</dd>
        </div>
        <div>
          <dt className="text-xs text-faint">Coverage</dt>
          <dd className="num text-xl font-semibold">{pct(s.coverage)}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-muted">{s.note}</p>
    </Card>
  );
}

function TakersCard({ r }: { r: MarketXray }) {
  const price = (p: number) => `${Math.round(p * 100)}%`;
  return (
    <Card>
      <H2 sub={`The biggest wallets pushing the move, with the X-ray of their own record. Open a wallet for its full audit.`}>Who pushed it</H2>
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
      <p className="mt-3 text-xs leading-relaxed text-faint">
        Only the top {r.takers.length} takers by money are judged. A positive record is shown as it is, flagged as unproven going forward: past winners rarely stay ahead.
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
