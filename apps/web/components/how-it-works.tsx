import type { ReactNode } from "react";

const I = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

const STEPS: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "A price moves",
    body: "A market jumps several points in a few hours.",
    icon: <svg {...I}><path d="M3 17l5-6 4 3 8-9" /><path d="M15 5h5v5" /></svg>,
  },
  {
    title: "Who pushed it",
    body: "The fills behind the move, summed by wallet.",
    icon: <svg {...I}><circle cx="9" cy="8" r="3" /><path d="M3 19c0-3.3 2.7-5 6-5s6 1.7 6 5" /><circle cx="17" cy="9" r="2.3" /><path d="M17 14c2.2 0 4 1.2 4 3.5" /></svg>,
  },
  {
    title: "X-ray each wallet",
    body: "Its real record against the prices it paid, with luck and sniping removed.",
    icon: <svg {...I}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /><path d="M8.5 11h5M11 8.5v5" /></svg>,
  },
  {
    title: "Square-money gauge",
    body: "The share of the pushing money from proven losers, with its coverage.",
    icon: <svg {...I}><path d="M4 17a8 8 0 0 1 16 0" /><path d="M12 17l4-6" /><circle cx="12" cy="17" r="1.2" /></svg>,
  },
  {
    title: "Sealed on Walrus + Sui",
    body: "The verdict is stored with a Sui checkpoint before the result is known.",
    icon: <svg {...I}><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V8a4 4 0 0 1 8 0v2" /><path d="M12 14v2" /></svg>,
  },
  {
    title: "Graded",
    body: "When the market resolves, the call is scored against the price.",
    icon: <svg {...I}><circle cx="12" cy="12" r="8.5" /><path d="M8 12.5l3 3 5-6" /></svg>,
  },
];

/** The pipeline in six steps, as a strip on wide screens and a two-column grid on a phone. */
export function HowItWorks() {
  return (
    <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 lg:gap-0" aria-label="How it works">
      {STEPS.map((s, i) => (
        <li
          key={s.title}
          className="flow-step relative rounded-xl border border-line bg-panel p-4 lg:rounded-none lg:border-y lg:border-l lg:first:rounded-l-xl lg:last:rounded-r-xl lg:last:border-r"
          style={{ animationDelay: `${i * 90}ms` }}
        >
          <div className="flex items-center justify-between">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-accent/30 bg-accent/10 text-accent">{s.icon}</span>
            <span className="num text-xs text-faint">0{i + 1}</span>
          </div>
          <h3 className="mt-3 text-sm font-semibold leading-snug">{s.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted">{s.body}</p>
          {i < STEPS.length - 1 ? (
            <span aria-hidden className="absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-bg text-[10px] text-accent lg:flex">›</span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
