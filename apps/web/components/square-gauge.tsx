import { GAUGE_ZONES, arcPath, clamp01, gaugeZone, polar } from "@/lib/gauge";

const CX = 120;
const CY = 118;
const R = 84;
const STROKE = 16;
const BAND_R = 102;

/**
 * The square-money gauge: a half circle that fills with the share of the money pushing a move that came from wallets with a
 * proven losing record, in a colour that runs from calm to caution. A lighter outer band shows the coverage, the part of the
 * pushing money that could be judged at all: a share is only as good as the coverage behind it. The gauge describes who pushed
 * the price. It never says what to do about it.
 */
export function SquareGauge({
  share, coverage, size = "lg", className = "",
}: { share: number; coverage: number; size?: "lg" | "sm"; className?: string }) {
  const s = clamp01(share);
  const c = Math.max(s, clamp01(coverage));
  const zone = gaugeZone(s);
  const label = `Square money ${Math.round(s * 100)}% of the money pushing the move, ${zone.label.toLowerCase()}. ${Math.round(c * 100)}% of that money could be judged.`;
  const tip = polar(CX, CY, R, s);
  const big = size === "lg";
  return (
    <svg
      viewBox="0 0 240 146"
      role="img"
      aria-label={label}
      className={`${big ? "w-full max-w-[320px]" : "w-[7.5rem]"} ${className}`}
    >
      <title>{label}</title>
      {/* Coverage: the outer band, lighter, from zero to the judged share of the money. */}
      <path d={arcPath(CX, CY, BAND_R, 0, 1)} fill="none" stroke="var(--color-line)" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
      {c > 0 ? (
        <path d={arcPath(CX, CY, BAND_R, 0, c)} fill="none" stroke="var(--color-muted)" strokeWidth={4} strokeLinecap="round" opacity={0.75} />
      ) : null}

      {/* The scale: three zones at low strength, the filled part over them at full strength. */}
      {GAUGE_ZONES.map((z, i) => {
        const from = i === 0 ? 0 : GAUGE_ZONES[i - 1]!.upTo;
        return <path key={z.name} d={arcPath(CX, CY, R, from, z.upTo)} fill="none" stroke={z.color} strokeWidth={STROKE} opacity={0.16} />;
      })}
      {s > 0 ? (
        <path
          className="gauge-fill"
          d={arcPath(CX, CY, R, 0, s)}
          pathLength={1}
          fill="none"
          stroke={zone.color}
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />
      ) : null}
      <circle cx={tip.x} cy={tip.y} r={STROKE / 2 + 2.5} fill="var(--color-bg)" stroke={zone.color} strokeWidth={2.5} />

      <text x={CX} y={CY - 6} textAnchor="middle" className="num" fontSize={36} fontWeight={650} fill="var(--color-fg)">
        {Math.round(s * 100)}%
      </text>
      <text x={CX} y={CY + 14} textAnchor="middle" fontSize={12} fontWeight={600} fill={zone.color} letterSpacing="0.06em">
        {zone.label.toUpperCase()}
      </text>
      <text x={CX - R} y={CY + 28} textAnchor="middle" fontSize={10} fill="var(--color-faint)">0</text>
      <text x={CX + R} y={CY + 28} textAnchor="middle" fontSize={10} fill="var(--color-faint)">100%</text>
    </svg>
  );
}

/** The three colour zones as a legend, with the coverage band explained. */
export function GaugeLegend({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted ${className}`}>
      {GAUGE_ZONES.map((z, i) => (
        <li key={z.name} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2 w-5 rounded-full" style={{ background: z.color }} />
          {z.label} <span className="text-faint">{i === 0 ? "under 15%" : i === 1 ? "15 to 35%" : "over 35%"}</span>
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span aria-hidden className="h-1 w-5 rounded-full bg-muted/75" />
        Outer band: how much of the money could be judged
      </li>
    </ul>
  );
}
