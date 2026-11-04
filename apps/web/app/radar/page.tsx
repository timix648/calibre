import type { Metadata } from "next";
import { verdictSquare } from "@calibre/core";
import Link from "next/link";
import { GaugeLegend, SquareGauge } from "@/components/square-gauge";
import { SmartInput } from "@/components/smart-input";
import { Badge, Card, ExternalLink, H2, PageTitle, TableWrap } from "@/components/ui";
import { dataGeneratedAt, outcomeFor, verdicts } from "@/lib/data";
import { pct, sourceLabel, utc, walruscan } from "@/lib/format";

export const metadata: Metadata = {
  title: "Radar",
  description: "Recent price moves on Polymarket, judged by who traded them and sealed on Walrus before the result.",
};

export default function Radar() {
  const rows = [...verdicts].sort((a, b) => b.data.sealedAt.localeCompare(a.data.sealedAt));
  return (
    <div className="space-y-8">
      <PageTitle
        title="Radar"
        sub="Recent price moves, judged by who traded them. Each verdict was written to Walrus Memory with a Sui checkpoint before the result was known, and is graded when the market resolves."
      />

      <Card>
        <H2 sub="A live X-ray of the latest move in any Polymarket market: who pushed it, and how much of that money came from traders with a proven losing record.">
          Check any market
        </H2>
        <SmartInput placeholder="Paste a Polymarket market or event link" button="X-ray" />
      </Card>

      <Card>
        <H2 sub="The gauge fills with the share of the money pushing a move that came from wallets with a proven losing record. The outer band is how much of that money could be judged at all. It describes who pushed the price; it is not a call to act.">
          Reading the square-money gauge
        </H2>
        <GaugeLegend />
      </Card>

      <section aria-labelledby="sealed">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sealed" className="text-lg font-semibold tracking-tight">Sealed verdicts</h2>
          <span className="text-xs text-faint">Exported {utc(dataGeneratedAt)}</span>
        </div>
        <p className="mb-3 text-sm">
          <Link href="/record" className="text-accent underline decoration-accent/40 hover:decoration-accent">See CALIBRE&apos;s own record</Link>
          <span className="text-muted"> for every verdict graded against the market price, including the ones it got wrong.</span>
        </p>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          The label is the sealed model&apos;s read of the money behind the move, from the edge it had learned for each wallet. It is not a claim that anyone behind a move is skilled.
          Square money is a caution signal: in a replay of 11,975 moves, loser-driven moves did 3.1 pts worse for followers (p = 0.07); early evidence, not conclusive. The square-money share is recorded from model v3 onward; earlier verdicts (v1, v2) predate the measure and stay as they were sealed.
        </p>
        {rows.length === 0 ? (
          <p className="text-muted">No verdicts have been sealed yet.</p>
        ) : (
          <>
          <ul className="space-y-3 md:hidden">
            {rows.map((v) => {
              const d = v.data;
              const graded = outcomeFor(v.key);
              const square = verdictSquare(d);
              return (
                <li key={v.id} className="rounded-xl border border-line bg-panel p-4">
                  <Link href={`/move/${v.id}`} className="font-medium leading-snug text-fg underline decoration-line underline-offset-4">{d.question}</Link>
                  <div className="mt-1 text-xs text-faint">{d.league.toUpperCase()} · {d.wallets} wallets, {d.trades} fills</div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="num text-sm text-muted">{pct(d.move.from)} → {pct(d.move.to)}</div>
                      <div className="mt-1.5 flex items-center gap-1.5"><Badge tone="accent">{d.label}</Badge><span className="text-xs text-faint">{d.model ?? "v1"}</span></div>
                    </div>
                    {square ? (
                      <div className="text-center"><SquareGauge share={square.share} coverage={square.coverage} size="sm" /><div className="num text-[11px] text-faint">judged {pct(square.coverage)}</div></div>
                    ) : <span className="text-xs text-faint">square money not recorded</span>}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                    <span>{utc(d.sealedAt)}</span>
                    {graded ? <Badge tone={graded.data.grade.gain > 0 ? "good" : "muted"}>Graded</Badge> : <Badge tone="warn">Waiting</Badge>}
                    <ExternalLink href={v.walruscan || walruscan(v.blobId)}>Walruscan</ExternalLink>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="hidden md:block">
          <TableWrap>
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Move</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Square money</th>
                  <th className="px-3 py-2 font-medium">Source</th>
                  <th className="px-3 py-2 font-medium">Sealed</th>
                  <th className="px-3 py-2 font-medium">Graded</th>
                  <th className="py-2 pl-3 font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((v) => {
                  const d = v.data;
                  const graded = outcomeFor(v.key);
                  const square = verdictSquare(d);
                  return (
                    <tr key={v.id} className="border-b border-line/60 align-top">
                      <td className="py-3 pr-3">
                        <Link href={`/move/${v.id}`} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-accent">{d.question}</Link>
                        <div className="mt-0.5 text-xs text-faint">{d.league.toUpperCase()} · {d.wallets} wallets, {d.trades} fills</div>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-3 text-muted">{pct(d.move.from)} → {pct(d.move.to)}</td>
                      <td className="px-3 py-3"><Badge tone="accent">{d.label}</Badge><span className="ml-1.5 text-xs text-faint">{d.model ?? "v1"}</span></td>
                      <td className="num px-3 py-3 text-muted">
                        {square ? <><SquareGauge share={square.share} coverage={square.coverage} size="sm" /><span className="block text-xs text-faint">judged {pct(square.coverage)}</span></> : <span className="text-faint">not recorded</span>}
                      </td>
                      <td className="px-3 py-3 text-muted">{sourceLabel(d.source)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{utc(d.sealedAt)}</td>
                      <td className="px-3 py-3">{graded ? <Badge tone={graded.data.grade.gain > 0 ? "good" : "muted"}>Graded</Badge> : <Badge tone="warn">Waiting</Badge>}</td>
                      <td className="py-3 pl-3"><ExternalLink href={v.walruscan || walruscan(v.blobId)}>Walruscan</ExternalLink></td>
                    </tr>
                  );
                })}
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
