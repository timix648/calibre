import Link from "next/link";
import { memory, scale, verdicts } from "@/lib/data";

/** "$1.78B" or "$197.6M"; the exact figure goes in the title attribute. */
function money(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${Math.round(v).toLocaleString("en-US")}`;
}
const int = (v: number) => v.toLocaleString("en-US");

/** The size of the evidence behind the labels; every figure is a plain sum over the study outputs (scripts/scale-stats.ts). */
export function ScaleBand() {
  const r = scale.replay;
  const sealed = memory.namespaces.find((n) => n.name === "calibre-verdicts")?.memories ?? verdicts.length;
  const items = [
    { value: money(r.marketVolumeUsd), exact: `$${int(r.marketVolumeUsd)}`, label: `traded in the ${int(r.markets)} closed markets we replayed, across ${r.leagues} leagues` },
    { value: money(r.pushingUsd), exact: `$${int(r.pushingUsd)}`, label: `of money behind ${int(r.moves)} price moves, traced to ${int(r.walletsLabeled)} wallets` },
    { value: int(scale.index.scoredBets), exact: int(scale.index.scoredBets), label: `bets scored against the price paid, across ${int(scale.index.wallets)} wallets` },
    { value: int(sealed), exact: int(sealed), label: "verdicts sealed on Walrus Memory before the result was known" },
  ];
  return (
    <section aria-label="The data behind it">
      <dl className="grid grid-cols-2 gap-y-8 border-y border-line py-8 lg:grid-cols-4 lg:divide-x lg:divide-line">
        {items.map((it) => (
          <div key={it.label} className="pr-4 lg:px-6 lg:first:pl-0">
            <dt className="sr-only">{it.label}</dt>
            <dd className="num text-3xl font-semibold tracking-tight text-fg sm:text-4xl" title={it.exact}>{it.value}</dd>
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
