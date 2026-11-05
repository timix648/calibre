import type { CSSProperties } from "react";
import { pts } from "@/lib/format";

/**
 * An edge with its error band (edge +/- 2 standard errors) on a fixed scale of -30 to +30 points.
 * The shaded luck band is zero plus or minus two standard errors; a band crossing zero cannot be told apart from luck.
 */
export function EdgeBar({
  edge, low, high, range = 0.3, label,
}: { edge: number; low: number | null; high: number | null; range?: number; label?: string }) {
  const W = 240;
  const H = 22;
  const x = (v: number) => W / 2 + (Math.max(-range, Math.min(range, v)) / range) * (W / 2 - 4);
  const known = low !== null && high !== null;
  const crossesZero = known && low! <= 0 && high! >= 0;
  const color = !known ? "var(--color-faint)" : crossesZero ? "var(--color-muted)" : edge > 0 ? "var(--color-good)" : "var(--color-bad)";
  const text = label ?? (known ? `Edge ${pts(edge)} points, band ${pts(low)} to ${pts(high)}` : "No scored bets");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={text} className="h-[22px] w-full min-w-[140px] max-w-[260px]">
      <title>{text}</title>
      {known ? <rect className="edge-band" x={x(-(high! - low!) / 2)} y={4} width={Math.max(1, x((high! - low!) / 2) - x(-(high! - low!) / 2))} height={H - 8} rx={3} fill="var(--color-muted)" opacity={0.14} /> : null}
      <line x1={x(-0.2)} x2={x(-0.2)} y1={H / 2 - 3} y2={H / 2 + 3} stroke="var(--color-line)" />
      <line x1={x(0.2)} x2={x(0.2)} y1={H / 2 - 3} y2={H / 2 + 3} stroke="var(--color-line)" />
      <line x1={W / 2} x2={W / 2} y1={2} y2={H - 2} stroke="var(--color-faint)" strokeDasharray="2 2" />
      {known ? (
        <>
          <g className="edge-band">
            <line x1={x(low!)} x2={x(high!)} y1={H / 2} y2={H / 2} stroke={color} strokeWidth={2} strokeLinecap="round" />
            <line x1={x(low!)} x2={x(low!)} y1={H / 2 - 5} y2={H / 2 + 5} stroke={color} strokeWidth={2} />
            <line x1={x(high!)} x2={x(high!)} y1={H / 2 - 5} y2={H / 2 + 5} stroke={color} strokeWidth={2} />
          </g>
          <circle className="edge-dot" style={{ "--from": `${W / 2 - x(edge)}px` } as CSSProperties} cx={x(edge)} cy={H / 2} r={4} fill={color} />
        </>
      ) : null}
    </svg>
  );
}
