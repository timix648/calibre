import { XRAY_TONE, type XrayLabel } from "@calibre/core";
import { Badge } from "./ui";

const SHORT: Record<XrayLabel, string> = {
  "proven losing record": "Proven losing record",
  "mostly sniping": "Mostly sniping",
  "too early": "Too early",
  "positive record (unproven going forward)": "Positive record (unproven)",
  "no proven edge": "No proven edge",
};

/** One-line meaning of each label, for tooltips and legends. */
export const LABEL_MEANING: Record<XrayLabel, string> = {
  "proven losing record": "Overall z of -2 or lower over at least 30 bets. The one label that holds going forward: past losers kept losing in our study.",
  "mostly sniping": "More than 40% of resolved bets were bought at 97 cents or more, or 3 cents or less, when the outcome was decided.",
  "too early": "Fewer than 30 scored bets.",
  "positive record (unproven going forward)": "Overall z of 2 or more over at least 100 bets. Past winners rarely stay ahead, so this is a record, not a signal.",
  "no proven edge": "Nothing separates the record from luck.",
};

export function XrayChip({ label, compact = false }: { label: XrayLabel | null; compact?: boolean }) {
  if (!label) return <Badge tone="muted">Not judged</Badge>;
  const tone = XRAY_TONE[label];
  return (
    <span title={LABEL_MEANING[label]}>
      <Badge tone={tone}>{compact ? SHORT[label] : label.charAt(0).toUpperCase() + label.slice(1)}</Badge>
    </span>
  );
}

/**
 * The money pushing a move, split into proven-losing wallets, judged wallets with no such record, and money that could not be
 * judged (wallets outside the audited few). The bar always carries its coverage: a share of the judged money says little when
 * most of the money was not judged.
 */
export function SquareBar({ share, coverage }: { share: number; coverage: number }) {
  const square = Math.max(0, Math.min(1, share));
  const judged = Math.max(square, Math.min(1, coverage));
  const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
  return (
    <div>
      <div
        role="img"
        aria-label={`Proven losing wallets ${Math.round(square * 100)}% of the money pushing the move; ${Math.round(judged * 100)}% of it could be judged`}
        className="flex h-4 w-full overflow-hidden rounded-full border border-line bg-panel-2"
      >
        <div className="h-full bg-bad" style={{ width: pct(square) }} />
        <div className="h-full bg-faint/60" style={{ width: pct(judged - square) }} />
        <div
          className="h-full flex-1"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 4px, color-mix(in srgb, var(--color-faint) 35%, transparent) 4px 5px)" }}
        />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-bad" />Proven losing record</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full bg-faint/60" />Judged, no such record</li>
        <li className="flex items-center gap-1.5"><span aria-hidden className="h-2 w-2 rounded-full border border-faint" />Not judged</li>
      </ul>
    </div>
  );
}
