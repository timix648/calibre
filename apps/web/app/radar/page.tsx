import type { Metadata } from "next";
import Link from "next/link";
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

      <section aria-labelledby="sealed">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sealed" className="text-lg font-semibold tracking-tight">Sealed verdicts</h2>
          <span className="text-xs text-faint">Exported {utc(dataGeneratedAt)}</span>
        </div>
        <p className="mb-4 text-sm leading-relaxed text-muted">
          The label is the sealed model&apos;s read of the money behind the move, from the edge it had learned for each wallet. It is not a claim that anyone behind a move is skilled:
          past winners rarely stay ahead. The square-money share is shown when the verdict recorded it; earlier verdicts predate the measure.
        </p>
        {rows.length === 0 ? (
          <p className="text-muted">No verdicts have been sealed yet.</p>
        ) : (
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
                  return (
                    <tr key={v.id} className="border-b border-line/60 align-top">
                      <td className="py-3 pr-3">
                        <Link href={`/move/${v.id}`} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-accent">{d.question}</Link>
                        <div className="mt-0.5 text-xs text-faint">{d.league.toUpperCase()} · {d.wallets} wallets, {d.trades} fills</div>
                      </td>
                      <td className="num whitespace-nowrap px-3 py-3 text-muted">{pct(d.move.from)} → {pct(d.move.to)}</td>
                      <td className="px-3 py-3"><Badge tone="accent">{d.label}</Badge><span className="ml-1.5 text-xs text-faint">{d.model ?? "v1"}</span></td>
                      <td className="num px-3 py-3 text-muted">
                        {d.squareMoney ? <>{pct(d.squareMoney.share)}<span className="block text-xs text-faint">covers {pct(d.squareMoney.coverage)}</span></> : <span className="text-faint">not recorded</span>}
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
        )}
      </section>
    </div>
  );
}
