import Link from "next/link";
import type { ReactNode } from "react";
import { outcomeFor, verdicts } from "@/lib/data";
import { pct, span, suiscanCheckpoint, utc } from "@/lib/format";

/**
 * How CALIBRE works, told through one real sealed verdict instead of a generic diagram: the newest graded verdict that
 * recorded square money (falling back to the newest graded one, then the newest sealed one). Every value is read from
 * the exported Walrus data, so the example changes when the data does.
 */
function pick() {
  const graded = verdicts.filter((v) => outcomeFor(v.key));
  return graded.find((v) => (v.data.squareShare ?? 0) > 0) ?? graded[0] ?? verdicts[0];
}

function Step({ n, title, value, children }: { n: number; title: string; value: ReactNode; children?: ReactNode }) {
  return (
    <li className="relative grid grid-cols-[1.5rem_1fr] gap-x-4 pb-7 last:pb-0">
      <span aria-hidden className="relative z-10 mt-1 flex h-6 w-6 items-center justify-center rounded-full border border-accent/50 bg-bg text-[11px] font-medium text-accent num">{n}</span>
      <div>
        <div className="text-xs font-medium tracking-wide text-faint">{title}</div>
        <div className="mt-0.5 text-[15px] font-medium text-fg">{value}</div>
        {children ? <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted">{children}</p> : null}
      </div>
    </li>
  );
}

export function VerdictTrace() {
  const v = pick();
  if (!v) return null;
  const d = v.data;
  const o = outcomeFor(v.key);
  const up = d.move.to >= d.move.from;
  const judged = d.squareCoverage ?? null;
  const square = d.squareShare ?? null;
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-12">
      <div>
        <h2 id="how" className="text-2xl font-semibold tracking-tight text-balance">One real verdict, start to finish</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
          This is how every move on the radar is handled, shown with an actual verdict from the record rather than a diagram. It was written to
          Walrus Memory with a Sui checkpoint before the market resolved{o ? ", then graded when it did" : ""}.
        </p>
        {o ? (
          <p className="mt-3 text-sm leading-relaxed text-muted text-pretty">
            {o.data.grade.gain < 0 ? "It did not beat the market price, and the record says so." : "It scored better than the market price on this one."}{" "}
            Most graded verdicts are level with the price: the value is knowing who moved it.
          </p>
        ) : null}
        <Link href={`/move/${v.id}`} className="mt-5 inline-block text-sm text-accent underline decoration-accent/40 hover:decoration-accent">
          Open this verdict
        </Link>
      </div>

      <ol className="relative before:absolute before:bottom-3 before:left-3 before:top-3 before:w-px before:bg-line" aria-label="How a verdict is made">
        <Step n={1} title="The price moves" value={<>{d.question} <span className="num whitespace-nowrap text-accent">{pct(d.move.from)} → {pct(d.move.to)}</span></>}>
          {up ? "Up" : "Down"} {Math.abs(Math.round((d.move.to - d.move.from) * 100))} points in {span(d.move.endTs - d.move.startTs)}.
        </Step>
        <Step n={2} title="Who pushed it" value={<span className="num">{d.wallets.toLocaleString("en-US")} wallets, {d.trades.toLocaleString("en-US")} fills</span>}>
          The fills behind the move, summed by wallet, biggest first.
        </Step>
        <Step n={3} title="X-ray the takers" value={judged === null ? "Labels from the wallet index" : <span className="num">{pct(judged)} of the pushing money judged</span>}>
          Each big taker is scored against the prices it paid on bets that had already resolved. Wallets with too short a record are left unjudged, not guessed.
        </Step>
        <Step n={4} title="Square money" value={square === null ? "Not recorded by this model" : <span className="num">{pct(square)} from proven losers</span>}>
          A caution signal, not a trade: it describes who pushed the price.
        </Step>
        <Step
          n={5}
          title="Sealed before the result"
          value={<span className="num">{utc(d.sealedAt)}</span>}
        >
          Sui checkpoint <a className="num text-accent underline decoration-accent/40" href={suiscanCheckpoint(d.checkpoint.sequence)} target="_blank" rel="noreferrer">{Number(d.checkpoint.sequence).toLocaleString("en-US")}</a>,
          blob <a className="num break-all text-accent underline decoration-accent/40" href={v.walruscan} target="_blank" rel="noreferrer">{v.blobId.slice(0, 10)}…</a> on Walruscan.
        </Step>
        <Step
          n={6}
          title="Graded"
          value={o ? <span className="num">Resolved {o.data.resolution}: forecast Brier {o.data.grade.forecastBrier.toFixed(3)}, market {o.data.grade.marketBrier.toFixed(3)}</span> : "Waiting for the market to resolve"}
        >
          {o ? <>The outcome is its own memory, <a className="num text-accent underline decoration-accent/40" href={o.walruscan} target="_blank" rel="noreferrer">{o.blobId.slice(0, 10)}…</a>, pointing back at the verdict.</> : null}
        </Step>
      </ol>
    </div>
  );
}
