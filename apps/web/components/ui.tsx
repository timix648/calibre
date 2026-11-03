import type { ReactNode } from "react";

type Tone = "good" | "bad" | "muted" | "warn" | "accent";

const TONES: Record<Tone, string> = {
  good: "border-good/40 bg-good/10 text-good",
  bad: "border-bad/40 bg-bad/10 text-bad",
  warn: "border-warn/40 bg-warn/10 text-warn",
  accent: "border-accent/40 bg-accent/10 text-accent",
  muted: "border-line bg-panel-2 text-muted",
};

export function Badge({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-panel p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function H2({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {sub ? <p className="mt-1 text-sm leading-relaxed text-muted">{sub}</p> : null}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {sub ? <p className="mt-2 max-w-3xl leading-relaxed text-muted">{sub}</p> : null}
    </header>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel-2 px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-faint">{label}</div>
      <div className="num mt-1 text-xl font-semibold">{value}</div>
      {note ? <div className="mt-1 text-xs text-muted">{note}</div> : null}
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
