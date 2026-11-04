import { XRAY_SHORT, XRAY_SUBTITLE, type XrayLabel } from "@calibre/core";
import { labelValidation, type ValidationLabel } from "@/lib/data";
import { TableWrap } from "./ui";

const W = 360;
const H = 330;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 232;
/** Points per bet: the lowest interval end is -5.1 and the highest +4.1. */
const MAX_PT = 5;
const MIN_PT = -6;
const y = (v: number) => PLOT_TOP + ((MAX_PT - v) / (MAX_PT - MIN_PT)) * (PLOT_BOTTOM - PLOT_TOP);
const ZERO = y(0);
const TICKS = [4, 2, 0, -2, -4, -6];

/** A signed number with a real minus sign, one decimal. */
export const signedPts = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`;
const tick = (t: number) => (t > 0 ? `+${t}` : t < 0 ? `−${Math.abs(t)}` : "0");

export function validationRow(label: XrayLabel, phase: "all" | "pregame" | "inplay" = "all"): ValidationLabel | undefined {
  return labelValidation.phases.find((p) => p.phase === phase)?.labels.find((l) => l.label === label);
}

export function allWallets(phase: "all" | "pregame" | "inplay" = "all"): { wallets: number; row: ValidationLabel } | undefined {
  const p = labelValidation.phases.find((x) => x.phase === phase);
  const row = p?.labels.find((l) => (l.label as string) === "all wallets");
  return p && row ? { wallets: p.wallets, row } : undefined;
}

const lostAgain = (r: ValidationLabel) => (r.shareNegative === null ? "n/a" : `${Math.round(r.shareNegative * 100)}%`);

/**
 * The label test as one picture: the edge that wallets with each label had on their NEXT bets, in points per bet, with the 95%
 * interval as a whisker. Proven losing record against proven winning record against everyone.
 */
export function LabelTestChart() {
  const losing = validationRow("proven losing record");
  const winning = validationRow("proven winning record");
  const all = allWallets()?.row;
  if (!losing || !winning || !all) return null;
  const cols = [
    { x: 78, name: ["Proven losing", "record"], row: losing, color: "var(--color-bad)" },
    { x: 180, name: ["Proven winning", "record"], row: winning, color: "var(--color-good)" },
    { x: 282, name: ["All", "wallets"], row: all, color: "var(--color-muted)" },
  ];
  const BAR = 56;
  const label = `Edge on the next bets, points per bet, with the 95% interval. ${cols.map((c) => `${c.name.join(" ")}: ${signedPts(c.row.meanNewEdgePts)}, ${c.row.wallets} wallets`).join(". ")}.`;
  const foot = PLOT_BOTTOM + 24;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto block w-full max-w-[520px]">
      <title>{label}</title>
      {TICKS.map((t) => (
        <g key={t}>
          <line x1={34} x2={W - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-muted)" : "var(--color-line)"} strokeWidth={t === 0 ? 1.5 : 1} strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={28} y={y(t) + 4} textAnchor="end" fontSize={11} className="num" fill={t === 0 ? "var(--color-fg)" : "var(--color-faint)"}>{tick(t)}</text>
        </g>
      ))}
      <text x={34} y={13} fontSize={11} fill="var(--color-faint)">Edge on their next bets, points per bet (95% interval)</text>
      {cols.map((c, i) => {
        const v = c.row.meanNewEdgePts;
        const h = Math.max(2, Math.abs(y(v) - ZERO));
        const [lo, hi] = c.row.ci95Pts ?? [v, v];
        return (
          <g key={c.name.join("")}>
            <rect
              x={c.x - BAR / 2} y={v >= 0 ? ZERO - h : ZERO} width={BAR} height={h} rx={3} fill={c.color} opacity={0.85}
              className="bar-grow" style={{ animationDelay: `${80 + i * 90}ms`, transformOrigin: `${c.x}px ${ZERO}px` }}
            />
            <line x1={c.x} x2={c.x} y1={y(hi)} y2={y(lo)} stroke="var(--color-fg)" strokeWidth={1.6} />
            <line x1={c.x - 7} x2={c.x + 7} y1={y(hi)} y2={y(hi)} stroke="var(--color-fg)" strokeWidth={1.6} />
            <line x1={c.x - 7} x2={c.x + 7} y1={y(lo)} y2={y(lo)} stroke="var(--color-fg)" strokeWidth={1.6} />
            <text x={c.x} y={foot} textAnchor="middle" fontSize={15} fontWeight={650} className="num" fill="var(--color-fg)">{signedPts(v)}</text>
            <text x={c.x} y={foot + 17} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-fg)">{c.name[0]}</text>
            <text x={c.x} y={foot + 31} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-fg)">{c.name[1]}</text>
            <text x={c.x} y={foot + 47} textAnchor="middle" fontSize={11} className="num" fill="var(--color-muted)">{c.row.wallets} wallets</text>
          </g>
        );
      })}
    </svg>
  );
}

const ORDER: XrayLabel[] = ["proven losing record", "proven winning record", "no proven edge", "too early"];

/** The label test as a table: wallets, edge on older and newer bets, interval, and the share with a negative next half. */
export function LabelTestTable({ phase = "all", compact = false }: { phase?: "all" | "pregame" | "inplay"; compact?: boolean }) {
  const data = labelValidation.phases.find((p) => p.phase === phase);
  if (!data) return null;
  const rows = [
    ...ORDER.map((l) => ({ name: XRAY_SHORT[l], sub: XRAY_SUBTITLE[l], r: validationRow(l, phase), strong: l === "proven losing record" || l === "proven winning record" })),
    { name: "All wallets", sub: "", r: allWallets(phase)?.row, strong: false },
  ].filter((x): x is { name: string; sub: string; r: ValidationLabel; strong: boolean } => x.r !== undefined);
  return (
    <TableWrap>
      <table className="mt-1 w-full min-w-[520px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
            <th className="py-2 pr-3 font-medium">Label from the older half</th>
            <th className="px-3 py-2 text-right font-medium">Wallets</th>
            {compact ? null : <th className="px-3 py-2 text-right font-medium">Older edge</th>}
            <th className="px-3 py-2 text-right font-medium">Next edge (pts)</th>
            <th className="px-3 py-2 text-right font-medium">95% interval</th>
            <th className="py-2 pl-3 text-right font-medium">Negative next half</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ name, r, strong }) => (
            <tr key={name} className="border-b border-line/60">
              <td className={`py-2 pr-3 ${strong ? "font-medium" : ""}`}>{name}</td>
              <td className="num px-3 py-2 text-right text-muted">{r.wallets}</td>
              {compact ? null : <td className="num px-3 py-2 text-right text-muted">{signedPts(r.meanOldEdgePts)}</td>}
              <td className={`num px-3 py-2 text-right ${strong ? (r.meanNewEdgePts < 0 ? "text-bad" : "text-good") : "text-muted"}`}>{signedPts(r.meanNewEdgePts)}</td>
              <td className="num px-3 py-2 text-right text-muted">{r.ci95Pts ? `${signedPts(r.ci95Pts[0])} to ${signedPts(r.ci95Pts[1])}` : "n/a"}</td>
              <td className="num py-2 pl-3 text-right text-muted">{lostAgain(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  );
}
