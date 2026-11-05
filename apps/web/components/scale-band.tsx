import Link from "next/link";
import { memory, scale, verdicts } from "@/lib/data";
import { CountUp } from "./count-up";

const int = (v: number) => v.toLocaleString("en-US");

/** The size of the evidence behind the labels; every figure is a plain sum over the study outputs (scripts/scale-stats.ts). */
export function ScaleBand() {
  const r = scale.replay;
  const sealed = memory.namespaces.find((n) => n.name === "calibre-verdicts")?.memories ?? verdicts.length;
  const items = [
    { value: <CountUp value={r.marketVolumeUsd} compact="B" decimals={2} prefix="$" duration={1800} />, exact: `$${int(r.marketVolumeUsd)}`, label: `traded in the ${int(r.markets)} closed markets we replayed, across ${r.leagues} leagues` },
    { value: <CountUp value={r.pushingUsd} compact="M" decimals={1} prefix="$" duration={1800} />, exact: `$${int(r.pushingUsd)}`, label: `of money behind ${int(r.moves)} price moves, traced to ${int(r.walletsLabeled)} wallets` },
    { value: <CountUp value={scale.index.scoredBets} duration={1800} />, exact: int(scale.index.scoredBets), label: `bets scored against the price paid, across ${int(scale.index.wallets)} wallets` },
    { value: <CountUp value={sealed} />, exact: int(sealed), label: "verdicts sealed on Walrus Memory before the result was known" },
  ];
  return (
    <section aria-label="The data behind it">
      <dl data-stagger className="grid grid-cols-2 gap-y-10 py-4 lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="measure pr-6">
            <dt className="sr-only">{it.label}</dt>
            <dd className="num mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-5xl" title={it.exact}>{it.value}</dd>
            <dd className="mt-2 max-w-[16rem] text-sm leading-snug text-muted text-pretty">{it.label}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-faint">
        Market volume is Polymarket&apos;s own figure for each replayed market. Every number is a plain sum over the study outputs:{" "}
        <Link href="/method" className="underline decoration-line hover:text-muted">method</Link>.
      </p>
    </section>
  );
}
