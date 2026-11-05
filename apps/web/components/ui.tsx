import type { ReactNode } from "react";
import { CountUp } from "./count-up";

type Tone = "good" | "bad" | "muted" | "warn" | "accent";

const TONES: Record<Tone, string> = {
  good: "bg-good/12 text-good",
  bad: "bg-bad/12 text-bad",
  warn: "bg-warn/12 text-warn",
  accent: "bg-accent/12 text-accent",
  muted: "bg-white/[0.05] text-muted",
};

/** A small cut-corner tag (not a pill): the label of a wallet, a verdict or a state. */
export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`chamfer-tag inline-flex items-center whitespace-nowrap px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

/** An open section framed by corner brackets; it rises into view as it scrolls in. */
export function Card({ children, className = "", reveal = "up" }: { children: ReactNode; className?: string; reveal?: "up" | "left" | "right" }) {
  return <section data-reveal={reveal} className={`plate ${className}`}>{children}</section>;
}

export function H2({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="flex items-center gap-3 text-xl font-semibold tracking-tight">
        <span aria-hidden className="h-[3px] w-5 shrink-0 bg-accent [clip-path:polygon(0_0,100%_0,80%_100%,0_100%)]" />
        {children}
      </h2>
      {sub ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}

/** A page heading: a tab with the section name, then a large title. */
export function PageTitle({ title, sub, tab }: { title: ReactNode; sub?: ReactNode; tab?: string }) {
  return (
    <header className="mb-10">
      <span className="tab">{tab ?? (typeof title === "string" ? title : "CALIBRE")}</span>
      <h1 className="mt-4 text-3xl font-semibold leading-[1.05] tracking-[-0.02em] sm:text-5xl">{title}</h1>
      {sub ? <p className="mt-4 max-w-3xl text-base leading-relaxed text-muted sm:text-lg">{sub}</p> : null}
    </header>
  );
}

/** A measurement, not a tile: a hairline with an accent segment, the label, then a value that counts up when it is a number. */
export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="measure">
      <div className="num text-[11px] uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="num mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{typeof value === "number" ? <CountUp value={value} /> : value}</div>
      {note ? <div className="mt-1.5 text-xs leading-snug text-muted">{note}</div> : null}
    </div>
  );
}

export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-accent underline decoration-accent/40 hover:decoration-accent">
      {children}
    </a>
  );
}

/** A horizontally scrollable wrapper so wide tables never break the page on a phone. */
export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>;
}
