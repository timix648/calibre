import { brier, type Outcome } from "./brier.js";

export interface Grade {
  /** Brier score of CALIBRE's skill-weighted forecast. */
  forecastBrier: number;
  /** Brier score of the market price right after the move (the baseline to beat). */
  marketBrier: number;
  /** marketBrier - forecastBrier: positive when CALIBRE beat the market. */
  gain: number;
}

export function gradeForecast(forecast: number, marketPrice: number, y: Outcome): Grade {
  const forecastBrier = brier(forecast, y);
  const marketBrier = brier(marketPrice, y);
  return { forecastBrier, marketBrier, gain: marketBrier - forecastBrier };
}

export interface GradeSummary {
  label: string;
  n: number;
  forecastBrier: number;
  marketBrier: number;
  gain: number;
  /** Share of verdicts where the forecast was closer to the outcome than the market price. */
  winRate: number;
}

/** Mean Brier scores per label, plus a final "all" row for every label together. */
export function summariseGrades(rows: { label: string; grade: Grade }[]): GradeSummary[] {
  const groups = new Map<string, Grade[]>();
  for (const r of rows) {
    for (const key of [r.label, "all"]) groups.set(key, [...(groups.get(key) ?? []), r.grade]);
  }
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  return [...groups]
    .map(([label, gs]) => ({
      label,
      n: gs.length,
      forecastBrier: mean(gs.map((g) => g.forecastBrier)),
      marketBrier: mean(gs.map((g) => g.marketBrier)),
      gain: mean(gs.map((g) => g.gain)),
      winRate: gs.filter((g) => g.gain > 0).length / gs.length,
    }))
    .sort((a, b) => (a.label === "all" ? 1 : b.label === "all" ? -1 : a.label.localeCompare(b.label)));
}

/**
 * Whether YES won in a resolved market. YES is the first listed outcome (Tatum maps outcome 0 to YES);
 * a resolution matching none of the outcomes (e.g. 50-50) cannot be graded and returns null.
 */
export function yesWon(resolution: string, outcomes: string[]): Outcome | null {
  const norm = (s: string) => s.trim().toLowerCase();
  const r = norm(resolution);
  if (!outcomes.some((o) => norm(o) === r)) return null;
  return norm(outcomes[0]!) === r ? 1 : 0;
}
