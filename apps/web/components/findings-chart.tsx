import type { FindingsRow } from "@/lib/data";

/** Rank correlation between a wallet's older and newer edge, one bar per sample. The first row is the artefact the study corrected. */
export function FindingsChart({ rows }: { rows: FindingsRow[] }) {
  const max = 0.5;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="py-2 pr-3 font-medium">Bets counted</th>
              <th className="px-3 py-2 font-medium">Wallets</th>
              <th className="w-[40%] px-3 py-2 font-medium">Older vs newer edge (rank correlation)</th>
              <th className="py-2 pl-3 text-right font-medium">p</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const artefact = i === 0;
              const width = (Math.abs(r.rho) / max) * 50;
              return (
                <tr key={i} className="border-b border-line/60 align-middle">
                  <td className="py-2.5 pr-3">
                    <div className={artefact ? "text-muted line-through decoration-faint" : ""}>{r.bets}</div>
                    {i === 4 ? <div className="text-xs text-faint">Top earners on the profit leaderboard</div> : null}
                    {artefact ? <div className="text-xs text-warn">Corrected: this was wallets buying already-decided outcomes</div> : null}
                  </td>
                  <td className="num px-3 py-2.5 text-muted">{r.wallets}</td>
                  <td className="px-3 py-2.5">
                    <div className="relative h-4" role="img" aria-label={`Rank correlation ${r.rho.toFixed(2)}`}>
                      <div className="absolute inset-y-0 left-1/2 w-px bg-line" />
                      <div
                        className={`absolute inset-y-0.5 rounded-sm ${artefact ? "bg-warn/50" : r.rho >= 0 ? "bg-faint" : "bg-faint"}`}
                        style={r.rho >= 0 ? { left: "50%", width: `${width}%` } : { right: "50%", width: `${width}%` }}
                      />
                    </div>
                    <div className="num mt-0.5 text-xs text-muted">{r.rho >= 0 ? "+" : "-"}{Math.abs(r.rho).toFixed(2)}</div>
                  </td>
                  <td className="num py-2.5 pl-3 text-right text-muted">{r.p < 0.01 ? "≈" + r.p.toFixed(3) : "≈" + r.p.toFixed(2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
