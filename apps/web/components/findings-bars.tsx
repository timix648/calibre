import type { WideRow } from "@/lib/data";

const W = 360;
const H = 312;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 246;
/** Axis in probability points: from +1 down to -3 covers every bar of the study. */
const MAX_PT = 1;
const MIN_PT = -3;
const y = (v: number) => PLOT_TOP + ((MAX_PT - v) / (MAX_PT - MIN_PT)) * (PLOT_BOTTOM - PLOT_TOP);
const ZERO = y(0);
const TICKS = [1, 0, -1, -2, -3];

const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");
const whole = (v: number) => { const r = Math.round(v * 100); return r === 0 ? "0" : `${r < 0 ? "−" : "+"}${Math.abs(r)}`; };
const pts = (v: number) => `${sign(v)}${Math.abs(v * 100).toFixed(1)}`;

function Bar({ x, width, value, color, delay }: { x: number; width: number; value: number; color: string; delay: number }) {
  const height = Math.max(2, Math.abs(y(value) - ZERO));
  return (
    <rect
      x={x}
      y={value >= 0 ? ZERO - height : ZERO}
      width={width}
      height={height}
      rx={3}
      fill={color}
      className="bar-grow"
      style={{ animationDelay: `${delay}ms`, transformOrigin: `${x + width / 2}px ${ZERO}px` }}
    />
  );
}

/**
 * The headline result as one picture: what the best third and the worst third of 983 wallets (ranked on their older bets)
 * earned on their next ones, in points per bet, around a zero line. The leaderboard is drawn as a flat marker because its
 * rank correlation is zero within noise.
 */
export function FindingsBars({ row, top }: { row: WideRow; top: WideRow }) {
  const label = `Edge on the next bets. Best third by older edge: ${pts(row.best)} points per bet. Worst third: ${pts(row.worst)} points per bet. Top profit-leaderboard earners: no signal, rank correlation ${top.rho.toFixed(2)}.`;
  const BEST = 98, WORST = 196, BOARD = 294, BAR = 62;
  const foot = PLOT_BOTTOM + 22;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="mx-auto block w-full max-w-[520px]">
      <title>{label}</title>
      {TICKS.map((t) => (
        <g key={t}>
          <line x1={34} x2={W - 4} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-muted)" : "var(--color-line)"} strokeWidth={t === 0 ? 1.5 : 1} strokeDasharray={t === 0 ? undefined : "3 4"} />
          <text x={28} y={y(t) + 4} textAnchor="end" fontSize={11} className="num" fill={t === 0 ? "var(--color-fg)" : "var(--color-faint)"}>
            {t > 0 ? `+${t}` : t < 0 ? `−${Math.abs(t)}` : "0"}
          </text>
        </g>
      ))}
      <text x={34} y={13} fontSize={11} fill="var(--color-faint)">Edge on their next bets, points per bet</text>

      <Bar x={BEST - BAR / 2} width={BAR} value={row.best * 100} color="var(--color-ash)" delay={80} />
      <text x={BEST} y={ZERO - 8} textAnchor="middle" fontSize={15} fontWeight={650} className="num" fill="var(--color-fg)">{pts(row.best)}</text>
      <text x={BEST} y={foot} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-fg)">Best third</text>
      <text x={BEST} y={foot + 16} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">past winners</text>
      <text x={BEST} y={foot + 31} textAnchor="middle" fontSize={11.5} className="num" fill="var(--color-muted)">≈ {whole(row.best)}</text>

      <Bar x={WORST - BAR / 2} width={BAR} value={row.worst * 100} color="var(--color-bad)" delay={240} />
      <text x={WORST} y={y(row.worst * 100) - 10} textAnchor="middle" fontSize={15} fontWeight={650} className="num" fill="var(--color-bg)">{pts(row.worst)}</text>
      <text x={WORST} y={foot} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-fg)">Worst third</text>
      <text x={WORST} y={foot + 16} textAnchor="middle" fontSize={11.5} fill="var(--color-bad)">past losers</text>
      <text x={WORST} y={foot + 31} textAnchor="middle" fontSize={11.5} className="num" fill="var(--color-bad)">≈ {whole(row.worst)} pts per bet</text>

      <line x1={BOARD - 40} x2={BOARD + 40} y1={ZERO} y2={ZERO} stroke="var(--color-faint)" strokeWidth={5} strokeLinecap="round" strokeDasharray="1 9" className="bar-fade" />
      <text x={BOARD} y={ZERO - 14} textAnchor="middle" fontSize={14} fontWeight={650} fill="var(--color-fg)">no signal</text>
      <text x={BOARD} y={ZERO + 22} textAnchor="middle" fontSize={11.5} className="num" fill="var(--color-muted)">rank corr. {top.rho < 0 ? "−" : ""}{Math.abs(top.rho).toFixed(2)}</text>
      <text x={BOARD} y={foot} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--color-fg)">Leaderboard</text>
      <text x={BOARD} y={foot + 16} textAnchor="middle" fontSize={11.5} fill="var(--color-muted)">top earners</text>
      <text x={BOARD} y={foot + 31} textAnchor="middle" fontSize={11.5} className="num" fill="var(--color-muted)">({top.wallets} wallets)</text>
    </svg>
  );
}
