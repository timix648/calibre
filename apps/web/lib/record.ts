import { summariseGrades, verdictSquare, type GradeSummary, type MoveLabel, type OutcomeData, type VerdictData } from "@calibre/core";

interface Sealed<T> { id: string; key: string; blobId: string; walruscan: string; data: T }

/** Fewer graded verdicts than this is too few to say whether CALIBRE beats the price. */
export const MIN_GRADED_TO_JUDGE = 20;

export interface RecordRow {
  id: string;
  question: string;
  league: string;
  yesOutcome: string;
  label: MoveLabel;
  model: string;
  sealedAt: string;
  /** Square-money share of the move (model v3); null for v1 and v2 verdicts, sealed before it was measured. */
  squareShare: number | null;
  squareCoverage: number | null;
  forecast: number;
  price: number;
  walruscan: string;
  /** Null until the market resolves and the grader seals the outcome. */
  graded: null | {
    resolution: string;
    yesWon: boolean;
    forecastBrier: number;
    marketBrier: number;
    /** marketBrier - forecastBrier: positive when CALIBRE's forecast was closer to the result than the price. */
    gain: number;
    outcomeWalruscan: string;
  };
}

export interface RecordSummary {
  sealed: number;
  graded: number;
  /** Mean Brier over graded verdicts; null with none. */
  forecastBrier: number | null;
  marketBrier: number | null;
  /** Mean of marketBrier - forecastBrier, with its standard error (null below two graded verdicts). */
  gain: number | null;
  gainSe: number | null;
  /** Share of graded verdicts where the forecast was closer than the price. */
  winRate: number | null;
  /** Per move label (and a final "all" row), graded verdicts only. */
  byLabel: GradeSummary[];
  enough: boolean;
  /** What the numbers allow us to say, in plain words. */
  readout: string;
}

export interface RecordData { rows: RecordRow[]; summary: RecordSummary }

/** Every sealed verdict (newest first) joined to its graded outcome when there is one, plus the summary of the graded ones. */
export function buildRecord(verdicts: Sealed<VerdictData>[], outcomes: Sealed<OutcomeData>[]): RecordData {
  const byKey = new Map(outcomes.map((o) => [o.data.verdictKey, o]));
  const rows: RecordRow[] = [...verdicts]
    .sort((a, b) => b.data.sealedAt.localeCompare(a.data.sealedAt))
    .map((v) => {
      const o = byKey.get(v.key);
      const square = verdictSquare(v.data);
      return {
        id: v.id, question: v.data.question, league: v.data.league, yesOutcome: v.data.yesOutcome, label: v.data.label,
        model: v.data.model ?? "v1", sealedAt: v.data.sealedAt,
        squareShare: square?.share ?? null, squareCoverage: square?.coverage ?? null,
        forecast: v.data.forecast, price: v.data.priceAtVerdict, walruscan: v.walruscan,
        graded: o
          ? {
              resolution: o.data.resolution, yesWon: o.data.yesWon === 1,
              forecastBrier: o.data.grade.forecastBrier, marketBrier: o.data.grade.marketBrier, gain: o.data.grade.gain,
              outcomeWalruscan: o.walruscan,
            }
          : null,
      };
    });
  return { rows, summary: summarise(rows) };
}

export function summarise(rows: RecordRow[]): RecordSummary {
  const graded = rows.flatMap((r) => (r.graded ? [{ label: r.label as string, grade: r.graded }] : []));
  const n = graded.length;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const gains = graded.map((g) => g.grade.gain);
  const gain = n ? mean(gains) : null;
  const gainSe = n >= 2 ? Math.sqrt(gains.reduce((s, g) => s + (g - gain!) ** 2, 0) / (n - 1) / n) : null;
  return {
    sealed: rows.length, graded: n,
    forecastBrier: n ? mean(graded.map((g) => g.grade.forecastBrier)) : null,
    marketBrier: n ? mean(graded.map((g) => g.grade.marketBrier)) : null,
    gain, gainSe,
    winRate: n ? gains.filter((g) => g > 0).length / n : null,
    byLabel: n ? summariseGrades(graded) : [],
    enough: n >= MIN_GRADED_TO_JUDGE,
    readout: readout(rows.length, n, gain, gainSe),
  };
}

function readout(sealed: number, n: number, gain: number | null, se: number | null): string {
  if (sealed === 0) return "No verdict has been sealed yet.";
  if (n === 0) return `${sealed} sealed, none graded yet: a verdict is graded only after its market resolves. There is nothing to judge yet.`;
  if (n < MIN_GRADED_TO_JUDGE) {
    return `Too few graded verdicts to judge yet: ${n} of ${sealed} sealed (we want at least ${MIN_GRADED_TO_JUDGE}). Any gap between CALIBRE and the market price on this few is noise.`;
  }
  if (gain === null || se === null || Math.abs(gain) < 2 * se) {
    return `Over ${n} graded verdicts CALIBRE's forecast and the market price are not clearly different (gain ${gain === null ? "n/a" : gain.toFixed(4)}, standard error ${se === null ? "n/a" : se.toFixed(4)}).`;
  }
  return gain > 0
    ? `Over ${n} graded verdicts CALIBRE's forecast was closer to the result than the market price (gain ${gain.toFixed(4)}, more than two standard errors).`
    : `Over ${n} graded verdicts CALIBRE's forecast was worse than the market price (gain ${gain.toFixed(4)}, more than two standard errors).`;
}
