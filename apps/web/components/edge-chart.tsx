import type { CSSProperties } from "react";
import { clearOfLuck } from "@/lib/gauge";
import { pts } from "@/lib/format";

const W = 360;
const H = 64;
const PAD = 18;
const CX = W / 2;
const MID = 27;

const fmtTick = (points: number) => (points === 0 ? "0" : `${points > 0 ? "+" : "−"}${Math.abs(points)}`);

/**
 * One phase of a wallet's record on a clean axis: edge in points per bet, a zero line, the luck band (where a wallet with no
 * edge at all lands 95% of the time, which is zero plus or minus two standard errors) and the wallet's own edge with a band
 * of two standard errors. A bar clear of the shaded band is outside luck; a bar inside it cannot be told apart from luck.
 * Pass the same `range` to several charts to put them on one axis.
 */
export function PhaseEdgeChart({
  edge, low, high, range, label,
}: { edge: number; low: number | null; high: number | null; range: number; label?: string }) {
  const known = low !== null && high !== null;
  const x = (v: number) => CX + (Math.max(-range, Math.min(range, v)) / range) * (CX - PAD);
  const luck = known ? (high! - low!) / 2 : null;
  const clear = clearOfLuck(low, high);
  const color = !known ? "var(--color-faint)" : clear ? (edge > 0 ? "var(--color-good)" : "var(--color-bad)") : "var(--color-muted)";
  const text =
    label ?? (known ? `Edge ${pts(edge)} points per bet, band ${pts(low)} to ${pts(high)}, ${clear ? "outside" : "inside"} the luck band` : "No scored bets");
  const ticks = [-range, -range / 2, 0, range / 2, range].map((t) => Math.round(t * 1000) / 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={text} className="block h-auto w-full max-w-[40rem]">
      <title>{text}</title>
      {luck !== null ? (
        <rect className="edge-band" x={x(-luck)} y={8} width={Math.max(1, x(luck) - x(-luck))} height={38} rx={5} fill="var(--color-muted)" opacity={0.16} />
      ) : null}
      {ticks.map((t) => (
        <g key={t}>
          <line x1={x(t / 100)} x2={x(t / 100)} y1={t === 0 ? 6 : 38} y2={46} stroke={t === 0 ? "var(--color-muted)" : "var(--color-line)"} strokeWidth={t === 0 ? 1.5 : 1} />
          <text x={x(t / 100)} y={60} textAnchor="middle" fontSize={10} className="num" fill={t === 0 ? "var(--color-fg)" : "var(--color-faint)"}>{fmtTick(t)}</text>
        </g>
      ))}
      {known ? (
        <>
          <g className="edge-band">
          <line x1={x(low!)} x2={x(high!)} y1={MID} y2={MID} stroke={color} strokeWidth={3} strokeLinecap="round" />
          <line x1={x(low!)} x2={x(low!)} y1={MID - 7} y2={MID + 7} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          <line x1={x(high!)} x2={x(high!)} y1={MID - 7} y2={MID + 7} stroke={color} strokeWidth={2.5} strokeLinecap="round" />
          </g>
          <circle className="edge-dot" style={{ "--from": `${CX - x(edge)}px` } as CSSProperties} cx={x(edge)} cy={MID} r={5.5} fill={color} stroke="var(--color-bg)" strokeWidth={2} />
        </>
      ) : (
        <text x={CX} y={MID + 4} textAnchor="middle" fontSize={12} fill="var(--color-muted)">No scored bets</text>
      )}
    </svg>
  );
}

export function LuckLegend() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
      <li className="flex items-center gap-1.5"><span aria-hidden className="h-3 w-5 rounded bg-muted/20" />Luck band: where a wallet with no edge lands 95% of the time</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="h-0.5 w-5 rounded bg-fg/80" />Zero: bets won exactly as often as their prices said</li>
      <li className="flex items-center gap-1.5"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-bad" />This wallet, ± 2 standard errors</li>
    </ul>
  );
}
