import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { auditVerdict, verdictSquare } from "@calibre/core";
import { SquareGauge } from "@/components/square-gauge";
import { Badge, Card, ExternalLink, H2, PageTitle, Stat, TableWrap } from "@/components/ui";
import { XrayChip } from "@/components/xray-ui";
import { outcomeFor, verdictById, verdicts } from "@/lib/data";
import { liveRecord } from "@/lib/live-record";
import { MOVE_LABEL_TEXT, VERDICT_TONE, pct, pts, shortAddr, sourceLabel, evidenceLabel, suiscanCheckpoint, utc, walruscan } from "@/lib/format";


// Pre-render the verdicts that existed at build time; `dynamicParams` lets one sealed since then render on demand.
export const dynamicParams = true;

export function generateStaticParams() {
  return verdicts.map((v) => ({ id: v.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const v = verdictById((await params).id);
  return { title: v ? `${v.data.question}: ${v.data.label}` : "Verdict" };
}

export default async function MovePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Look in the live record first, so a verdict sealed since the last export has a page too.
  const rec = await liveRecord();
  const v = verdictById(id, rec.verdicts) ?? verdictById(id);
  if (!v) notFound();
  const d = v.data;
  const model = d.model ?? "v1";
  const graded = outcomeFor(v.key, rec.outcomes);
  const wallets = d.topWallets;
  const proven = wallets.filter((w) => w.n !== null && w.z !== null && auditVerdict({ z: w.z, n: w.n }) === "proven edge").length;
  const unknown = wallets.filter((w) => w.n === null || w.n === 0).length;
  const shift = d.forecast - d.priceAtVerdict;
  const square = verdictSquare(d);
  const labelled = wallets.some((w) => w.label !== undefined);

  return (
    <div className="space-y-8">
      <div>
        <Link href="/radar" className="text-sm text-muted hover:text-fg">← Radar</Link>
        <div className="mt-3">
          <PageTitle tab="Sealed verdict"
            title={d.question}
            sub={
              <>
                <Badge tone="accent">{d.label}</Badge>{" "}
                <span className="ml-1">{MOVE_LABEL_TEXT[d.label]}</span>
              </>
            }
          />
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="The move">
        <Stat label={`${d.yesOutcome} price`} value={`${pct(d.move.from)} → ${pct(d.move.to)}`} note={`${utc(d.move.startTs)} to ${utc(d.move.endTs)}`} />
        <Stat label="CALIBRE forecast" value={pct(d.forecast, 1)} note={`${shift >= 0 ? "+" : "-"}${Math.abs(shift * 100).toFixed(1)} pts vs the ${pct(d.priceAtVerdict, 1)} price`} />
        <Stat label="Traded by" value={`${d.wallets} wallets`} note={`${d.trades} fills in the move`} />
        <Stat label="Learned-edge share" value={pct(d.sharpShare)} note="of the money pushing the move" />
      </section>

      {square ? (
        <Card>
          <H2 sub="Share of the money pushing this move that came from wallets with a proven losing record, read from the wallet index when the verdict was sealed. The six biggest pushers were judged; the rest count as not judged, which is why the coverage matters.">Square money</H2>
          <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr] sm:gap-10">
            <div className="mx-auto w-full max-w-[320px]">
              <SquareGauge share={square.share} coverage={square.coverage} />
              <p className="num mt-1 text-center text-xs text-muted">Judged <span className="text-fg">{pct(square.coverage)}</span> of the pushing money</p>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {pct(square.share)} of the money pushing the price came from wallets with a proven losing record; {pct(square.coverage)} of it belonged to wallets the index could judge.
              Caution signal. In a replay of 11,975 moves, loser-driven moves did 3.1 pts worse for followers (p = 0.07); early evidence, not conclusive.
            </p>
          </div>
        </Card>
      ) : null}

      <Card>
        <H2 sub="The largest wallets in the move, with the record CALIBRE held for them when it sealed the verdict. Open a wallet for its full live audit.">Who traded it</H2>
        <p className="mb-4 cut bg-white/[0.035] px-4 py-3 text-sm leading-relaxed">
          {proven === 0
            ? <>Of the {wallets.length} largest wallets here, <strong>none has a proven edge</strong> by CALIBRE&apos;s rules (z of 2 or more over at least 100 bets).{unknown > 0 ? ` ${unknown} had no scored record yet.` : ""} The label above describes edge CALIBRE had learned, not a claim that anyone behind this move is skilled.</>
            : <>{proven} of the {wallets.length} largest wallets have a proven edge by CALIBRE&apos;s rules (z of 2 or more over at least 100 bets).</>}
        </p>
        <TableWrap>
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2 pr-3 font-medium">Wallet</th>
                <th className="px-3 py-2 text-right font-medium">Net bet on {d.yesOutcome}</th>
                <th className="px-3 py-2 text-right font-medium">Edge held</th>
                <th className="px-3 py-2 text-right font-medium">z</th>
                <th className="px-3 py-2 text-right font-medium">Bets</th>
                <th className="py-2 pl-3 font-medium">{labelled ? "X-ray" : "Audit"}</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const has = w.n !== null && w.z !== null && w.n > 0;
                const verdict = has ? auditVerdict({ z: w.z!, n: w.n! }) : null;
                return (
                  <tr key={w.wallet} className="border-b border-line/60">
                    <td className="py-2.5 pr-3">
                      <Link href={`/wallet/${w.wallet}`} className="num text-accent underline decoration-accent/40">{shortAddr(w.wallet)}</Link>
                    </td>
                    <td className="num px-3 py-2.5 text-right">{w.netYesUsd >= 0 ? "+" : "-"}${Math.abs(Math.round(w.netYesUsd)).toLocaleString("en-US")}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{has ? `${pts(w.edge)} pts` : "none"}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{has ? w.z!.toFixed(1) : "n/a"}</td>
                    <td className="num px-3 py-2.5 text-right text-muted">{has ? w.n : "0"}</td>
                    <td className="py-2.5 pl-3">
                      {labelled
                        ? <XrayChip label={w.label ?? null} compact />
                        : verdict ? <Badge tone={VERDICT_TONE[verdict]}>{verdict}</Badge> : <Badge tone="warn">no record yet</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableWrap>
        <p className="mt-3 text-xs leading-relaxed text-faint">
          &quot;Edge held&quot; is the wallet&apos;s edge after shrinkage for small samples and a cap of 8 points, in the {d.league.toUpperCase()} category.
          A positive number here is not evidence of skill unless z and the bet count clear the bar.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <H2>Receipt</H2>
          <dl className="space-y-3 text-sm">
            <Row k="Sealed in Walrus Memory">
              <ExternalLink href={v.walruscan || walruscan(v.blobId)}>{v.blobId}</ExternalLink>
            </Row>
            <Row k="Sui checkpoint">
              <ExternalLink href={suiscanCheckpoint(d.checkpoint.sequence)}>{d.checkpoint.sequence}</ExternalLink>
              {d.checkpoint.timestamp ? <span className="text-muted"> at {utc(d.checkpoint.timestamp)}</span> : null}
              <span className="block text-xs text-muted">Read through Tatum&apos;s Sui gRPC gateway when the verdict was sealed.</span>
            </Row>
            <Row k="Sealed at">{utc(d.sealedAt)}</Row>
            <Row k="Judging model">
              {model}
              <span className="block text-xs text-muted">
                {model === "v1"
                  ? "Model v1 let a forecast sit far from the price. Walrus Memory is append-only, so it stays as sealed; v2 caps any forecast within 10 points of the price."
                  : model === "v2"
                    ? "Model v2 caps each wallet's edge at 8 points and keeps the forecast within 10 points of the price."
                    : "Model v3 judges like v2 and also records the square-money share and each top wallet's X-ray label, read from the wallet index."}
              </span>
            </Row>
            <Row k="Memory key"><span className="num break-all text-xs text-muted">{v.key}</span></Row>
          </dl>
        </Card>

        <Card>
          <H2>Data source</H2>
          <p className="text-sm leading-relaxed">
            <strong>{evidenceLabel(d)}.</strong>{" "}
            {d.source === "polymarket-public"
              ? <>The market was found through Tatum&apos;s Prediction Markets API and the checkpoint was read through Tatum&apos;s Sui gRPC. The trades behind the move came from Polymarket&apos;s public Data API {d.fallbackReason?.includes("hourly call cap") ? "because the watcher had used its hourly allowance of Tatum calls, a cap set to stretch the free plan" : d.fallbackReason?.includes("empty") ? "because Tatum's price history was empty for this market at the time" : "as a fallback"}{d.fallbackReason ? ` (${d.fallbackReason})` : ""}.{d.checkpoint.source === "sui-public-graphql" ? " This verdict's checkpoint came from Sui's public GraphQL." : ""}</>
              : "The prices and trades behind this move came from Tatum's Prediction Markets API."}
          </p>

          <h3 className="mt-6 text-sm font-semibold">Graded status</h3>
          {graded ? (
            <div className="mt-2 space-y-1 text-sm">
              <p>
                <Badge tone={graded.data.grade.gain > 0 ? "good" : "muted"}>Graded</Badge>{" "}
                Resolved <strong>{graded.data.resolution}</strong>. The forecast scored a Brier of <span className="num">{graded.data.grade.forecastBrier.toFixed(3)}</span> against{" "}
                <span className="num">{graded.data.grade.marketBrier.toFixed(3)}</span> for the market price ({graded.data.grade.gain > 0 ? "beat" : graded.data.grade.gain < 0 ? "lost to" : "tied"} the price).
              </p>
              <p><ExternalLink href={graded.walruscan}>Outcome blob</ExternalLink></p>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Not graded yet. When the market resolves, the grader scores the forecast against the price after the move and seals the outcome in the <span className="num">calibre-outcomes</span> namespace.
            </p>
          )}
        </Card>
      </div>

      <p className="text-sm leading-relaxed text-muted"><span className="text-faint">Sealed summary: </span>{v.summary}</p>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-faint">{k}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
