import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageTitle, TableWrap } from "@/components/ui";
import { outcomeFor, verdicts } from "@/lib/data";
import { pct, sourceLabel, suiscanCheckpoint, utc } from "@/lib/format";

export const metadata: Metadata = { title: "Sealed verdicts" };

export default function Moves() {
  return (
    <div>
      <PageTitle
        title="Sealed verdicts"
        sub="Each row is a price move CALIBRE judged by who traded it. The verdict was written to Walrus Memory with a Sui checkpoint before the result was known, and is graded once the market resolves."
      />
      {verdicts.length === 0 ? (
        <p className="text-muted">No verdicts have been sealed yet.</p>
      ) : (
        <TableWrap>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="py-2 pr-3 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Label</th>
                  <th className="px-3 py-2 font-medium">Move</th>
                  <th className="px-3 py-2 font-medium">Data source</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 font-medium">Checkpoint</th>
                  <th className="px-3 py-2 font-medium">Sealed</th>
                  <th className="py-2 pl-3 font-medium">Graded</th>
                </tr>
              </thead>
              <tbody>
                {verdicts.map((v) => {
                  const d = v.data;
                  const graded = outcomeFor(v.key);
                  return (
                    <tr key={v.id} className="border-b border-line/60 align-top">
                      <td className="py-3 pr-3">
                        <Link href={`/move/${v.id}`} className="font-medium text-fg underline decoration-line underline-offset-4 hover:decoration-accent">{d.question}</Link>
                        <div className="mt-0.5 text-xs text-faint">{d.league.toUpperCase()} · {d.wallets} wallets, {d.trades} fills</div>
                      </td>
                      <td className="px-3 py-3"><Badge tone="accent">{d.label}</Badge></td>
                      <td className="num whitespace-nowrap px-3 py-3 text-muted">{pct(d.move.from)} → {pct(d.move.to)}</td>
                      <td className="px-3 py-3 text-muted">{sourceLabel(d.source)}</td>
                      <td className="num px-3 py-3 text-muted">{d.model ?? "v1"}</td>
                      <td className="num px-3 py-3">
                        <a className="text-accent underline decoration-accent/40" href={suiscanCheckpoint(d.checkpoint.sequence)} target="_blank" rel="noreferrer noopener">{d.checkpoint.sequence}</a>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-muted">{utc(d.sealedAt)}</td>
                      <td className="py-3 pl-3">{graded ? <Badge tone={graded.data.grade.gain > 0 ? "good" : "muted"}>Graded</Badge> : <Badge tone="warn">Waiting</Badge>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        </TableWrap>
      )}
    </div>
  );
}
