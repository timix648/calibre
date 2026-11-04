/** Geometry and colour scale for the square-money gauge and the edge charts. Pure, so it is tested without a browser. */

export type GaugeZoneName = "calm" | "watch" | "caution";

export interface GaugeZone {
  name: GaugeZoneName;
  /** The zone covers shares up to and including this value. */
  upTo: number;
  /** CSS colour (a design token). */
  color: string;
  label: string;
}

/**
 * The colour scale runs from calm to caution. The cut points are a reading aid for the eye, not calibrated thresholds: no
 * study has shown what share of square money makes a move unreliable, so the gauge never says what to do about it.
 */
export const GAUGE_ZONES: readonly GaugeZone[] = [
  { name: "calm", upTo: 0.15, color: "var(--color-accent)", label: "Calm" },
  { name: "watch", upTo: 0.35, color: "var(--color-warn)", label: "Watch" },
  { name: "caution", upTo: 1, color: "var(--color-bad)", label: "Caution" },
];

export const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

export function gaugeZone(share: number): GaugeZone {
  const s = clamp01(share);
  return GAUGE_ZONES.find((z) => s <= z.upTo) ?? GAUGE_ZONES[GAUGE_ZONES.length - 1]!;
}

/** A point on the half circle: fraction 0 is the left end, 0.5 the top, 1 the right end. */
export function polar(cx: number, cy: number, r: number, fraction: number): { x: number; y: number } {
  const a = Math.PI * clamp01(fraction);
  return { x: cx - r * Math.cos(a), y: cy - r * Math.sin(a) };
}

const f2 = (n: number) => Math.round(n * 100) / 100;

/** SVG path of the arc between two fractions of the half circle (left to right over the top). */
export function arcPath(cx: number, cy: number, r: number, from: number, to: number): string {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  return `M ${f2(a.x)} ${f2(a.y)} A ${r} ${r} 0 0 1 ${f2(b.x)} ${f2(b.y)}`;
}

/** Nice axis ranges for the edge charts, in probability points (0.1 is 10 points). */
const RANGES = [0.1, 0.2, 0.3, 0.5, 1];

/**
 * One symmetric range that shows every error bar and luck band given, so several phases of one wallet can share an axis.
 * Intervals with unknown ends are ignored; with none, the smallest range is returned.
 */
export function edgeRange(spans: { low: number | null; high: number | null }[]): number {
  let widest = 0;
  for (const s of spans) {
    if (s.low === null || s.high === null) continue;
    widest = Math.max(widest, Math.abs(s.low), Math.abs(s.high), (s.high - s.low) / 2);
  }
  return RANGES.find((r) => r >= widest * 1.08) ?? RANGES[RANGES.length - 1]!;
}

/** True when the whole error band sits on one side of zero, that is, outside the luck band. */
export const clearOfLuck = (low: number | null, high: number | null): boolean => low !== null && high !== null && (low > 0 || high < 0);
