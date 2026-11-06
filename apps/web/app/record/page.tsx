import type { Metadata } from "next";
import Link from "next/link";
import { SquareGauge } from "@/components/square-gauge";
import { Badge, Card, ExternalLink, H2, PageTitle, Stat, TableWrap } from "@/components/ui";
import { liveRecord } from "@/lib/live-record";
import { pct, utc } from "@/lib/format";
import { buildRecord, type RecordRow } from "@/lib/record";

export const metadata: Metadata = {
  title: "CALIBRE's own record",
  description: "Every verdict CALIBRE sealed before the result was known, with its grade once the market resolves: forecast against the market price.",
};

const brier = (x: number | null) => (x === null ? "n/a" : x.toFixed(3));

function Result({ row }: { row: RecordRow }) {
  const g = row.graded;
  if (!g) return <Badge tone="warn">Waiting</Badge>;
  return (
    <span className="text-sm">
      <span className="text-fg">{g.yesWon ? `${row.yesOutcome} won` : `${row.yesOutcome} lost`}</span>
      <span className="block text-xs text-faint">{g.resolution}</span>
    </span>
  );
}

function Square({ row }: { row: RecordRow }) {
  if (row.squareShare === null || row.squareCoverage === null) return <span className="text-xs text-faint">not recorded ({row.model})</span>;
  return (
    <span className="inline-block text-center">
      <SquareGauge share={row.squareShare} coverage={row.squareCoverage} size="sm" />
      <span className="num block text-[11px] text-faint">judged {pct(row.squareCoverage)}</span>
    </span>
  );
}

function Scores({ row }: { row: RecordRow }) {
  const g = row.graded;
  if (!g) return <span className="text-faint">n/a</span>;
  return (
    <span className="num">
      <span className="text-fg">{g.forecastBrier.toFixed(3)}</span>
      <span className="text-faint"> vs </span>
      <span className="text-muted">{g.marketBrier.toFixed(3)}</span>
      <span className="block text-xs">
        <Badge tone={g.gain > 0 ? "good" : g.gain < 0 ? "bad" : "muted"}>{g.gain > 0 ? "closer than price" : g.gain < 0 ? "worse than price" : "tied"}</Badge>
      </span>
    </span>
  );
}

// Re-render at most every ten minutes, so a verdict sealed on Walrus appears without anything being deployed.
export const revalidate = 600;
// The Walrus recall takes 8 to 13 seconds; give the render room for a slow one.
export const maxDuration = 60;

export default async function Record() {
  const { verdicts, outcomes, generatedAt, source } = await liveRecord();
  const record = buildRecord(verdicts, outcomes);
  const { rows, summary } = record;
  return (
    <div className="space-y-8">
      <PageTitle tab="Graded calls"
        title="CALIBRE's own record"
        sub="Every verdict CALIBRE has sealed on Walrus before the result was known, with its grade once the market resolves. The grade compares CALIBRE's forecast with the market price at the time of the verdict, on the same result. Nothing here is edited after the fact: a verdict that turns out wrong stays on the list."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-label="Summary">
        <Stat label="Sealed verdicts" value={summary.sealed} />
        <Stat label="Graded" value={summary.graded} note={summary.graded === 0 ? "Graded when the market resolves" : `of ${summary.sealed} sealed`} />
        <Stat label="CALIBRE Brier" value={brier(summary.forecastBrier)} note="Lower is better" />
        <Stat label="Market-price Brier" value={brier(summary.marketBrier)} note="At verdict time" />
      </section>

      <Card>
        <H2>What the record says so far</H2>
        <p className="text-sm leading-relaxed">{summary.readout}</p>
        {summary.graded >= 2 && summary.gain !== null && summary.gainSe !== null ? (
          <p className="num mt-2 text-xs text-muted">
            Mean gain (price Brier minus CALIBRE Brier) {summary.gain >= 0 ? "+" : ""}{summary.gain.toFixed(4)} ± {summary.gainSe.toFixed(4)} (one standard error); the forecast was closer than the price in {pct(summary.winRate ?? 0)} of graded verdicts.
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-faint">
          Brier score is the squared gap between a probability and what happened (1 if the first outcome won, else 0). A forecast that beats the price must be closer to the result on average, not just once.
          Verdicts from model v1 and v2 are kept as sealed, including their known weaknesses; the model changes are explained on the <Link className="underline decoration-line underline-offset-4" href="/method">Method</Link> page.
        </p>
      </Card>

      <Card>
        <H2 sub="Graded verdicts only, grouped by the label the verdict was sealed with. A group with a handful of verdicts says nothing yet.">Results by label</H2>
        {summary.byLabel.length === 0 ? (
          <p className="text-sm text-muted">No verdict has been graded, so there are no results by label yet.</p>
        ) : (
          <TableWrap>
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">Label</th>
                  <th className="px-3 py-2 text-right font-medium">Graded</th>
                  <th className="px-3 py-2 text-right font-medium">CALIBRE Brier</th>
                  <th className="px-3 py-2 text-right font-medium">Price Brier</th>
                  <th className="px-3 py-2 text-right font-medium">Gain</th>
                  <th className="py-2 pl-3 text-right font-medium">Closer than price</th>
                </tr>
              </thead>
              <tbody>
                {summary.byLabel.map((g) => (
                  <tr key={g.label} className="border-b border-line/60">
                    <td className="py-2.5 pr-3">{g.label === "all" ? <strong>all</strong> : g.label}</td>
                    <td className="num px-3 py-2.5 text-right">{g.n}</td>
                    <td className="num px-3 py-2.5 text-right">{g.forecastBrier.toFixed(4)}</td>
                    <td className="num px-3 py-2.5 text-right">{g.marketBrier.toFixed(4)}</td>
                    <td className="num px-3 py-2.5 text-right">{g.gain >= 0 ? "+" : ""}{g.gain.toFixed(4)}</td>
                    <td className="num py-2.5 pl-3 text-right">{pct(g.winRate)}{g.n < 5 ? <span className="text-faint"> (n={g.n})</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </Card>

      <section aria-labelledby="all-verdicts">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="all-verdicts" className="text-lg font-semibold tracking-tight">Every sealed verdict</h2>
          <span className="text-xs text-faint">{source === "walrus" ? "Read from Walrus" : "Exported"} {utc(generatedAt)}</span>
        </div>
        {rows.length === 0 ? (
          <p className="text-muted">No verdicts have been sealed yet.</p>
        ) : (
          <>
            <ul className="space-y-3 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="plate p-4 sm:p-5">
                  <Link href={`/move/${r.id}`} className="font-medium leading-snug text-fg underline decoration-line underline-offset-4">{r.question}</Link>
                  <div className="mt-1 text-xs text-faint">{r.league.toUpperCase()} · sealed {utc(r.sealedAt)}</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5"><Badge tone="accent">{r.label}</Badge><span className="text-xs text-faint">{r.model}</span></div>
                    <Square row={r} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                    <div><dt className="text-xs text-faint">CALIBRE forecast</dt><dd className="num">{pct(r.forecast, 1)}</dd></div>
                    <div><dt className="text-xs text-faint">Market price</dt><dd className="num">{pct(r.price, 1)}</dd></div>
                    <div><dt className="text-xs text-faint">Result</dt><dd><Result row={r} /></dd></div>
                    <div><dt className="text-xs text-faint">Brier: CALIBRE vs price</dt><dd><Scores row={r} /></dd></div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    <ExternalLink href={r.walruscan}>Verdict on Walruscan</ExternalLink>
                    {r.graded ? <ExternalLink href={r.graded.outcomeWalruscan}>Outcome on Walruscan</ExternalLink> : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <TableWrap>
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                      <th className="py-2 pr-3 font-medium">Market</th>
                      <th className="px-3 py-2 font-medium">Label</th>
                      <th className="px-3 py-2 font-medium">Square money</th>
                      <th className="px-3 py-2 text-right font-medium">Forecast / price</th>
                      <th className="px-3 py-2 font-medium">Result</th>
                      <th className="px-3 py-2 font-medium">Brier: CALIBRE vs price</th>
                      <th className="py-2 pl-3 font-medium">Receipts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="border-b border-line/60 align-top">
                        <td className="py-3 pr-3">
                          <Link href={`/move/${r.id}`} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-accent">{r.question}</Link>
                          <div className="mt-0.5 text-xs text-faint">{r.league.toUpperCase()} · sealed {utc(r.sealedAt)}</div>
                        </td>
                        <td className="px-3 py-3"><Badge tone="accent">{r.label}</Badge><span className="ml-1.5 text-xs text-faint">{r.model}</span></td>
                        <td className="px-3 py-3"><Square row={r} /></td>
                        <td className="num whitespace-nowrap px-3 py-3 text-right text-muted">{pct(r.forecast, 1)} / {pct(r.price, 1)}</td>
                        <td className="px-3 py-3"><Result row={r} /></td>
                        <td className="px-3 py-3"><Scores row={r} /></td>
                        <td className="space-y-1 py-3 pl-3 text-xs">
                          <div><ExternalLink href={r.walruscan}>Verdict</ExternalLink></div>
                          {r.graded ? <div><ExternalLink href={r.graded.outcomeWalruscan}>Outcome</ExternalLink></div> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
