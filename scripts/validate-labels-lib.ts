// Label validation: does the X-ray label a wallet would have had from its OLDER bets predict its NEWER bets?
// Pure parsing and statistics over the per-wallet lines of the skill-persistence study logs (no network, no files).
import {
  XRAY_MIN_BETS, XRAY_MIN_BETS_LOSING, XRAY_MIN_BETS_POSITIVE, XRAY_LOSING_Z, XRAY_POSITIVE_Z, xrayLabelFromStats, type XrayLabel,
} from "../packages/core/src/index.js";

export interface LogRow {
  group: "random" | "top";
  /** First ten characters of the wallet address, as the study log prints it. */
  wallet: string;
  picks: number;
  oldEdge: number;
  oldZ: number;
  newEdge: number;
  newZ: number;
  leagues: string;
}

const LINE = /^\[\d+\]\s+(random|top)\s+(0x[0-9a-fA-F]+)\s+picks=(\d+)\s+edge old=(\S+) \(z (\S+)\) new=(\S+) \(z ([^)\s]+)\)\s*(.*)$/;

/** The per-wallet result lines of one study log. Lines about skipped wallets and the summary block are ignored. */
export function parseStudyLog(text: string): LogRow[] {
  const rows: LogRow[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r?\n/)) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const [oldEdge, oldZ, newEdge, newZ] = [m[4], m[5], m[6], m[7]].map(Number) as [number, number, number, number];
    if (![oldEdge, oldZ, newEdge, newZ].every(Number.isFinite)) continue;
    rows.push({ group: m[1] as LogRow["group"], wallet: m[2]!.toLowerCase(), picks: Number(m[3]), oldEdge, oldZ, newEdge, newZ, leagues: m[8] ?? "" });
  }
  return rows;
}

/** Scored bets in the older and newer half, the way the study splits them (older half = floor(picks / 2)). */
export const halves = (picks: number): { nOld: number; nNew: number } => ({ nOld: Math.floor(picks / 2), nNew: picks - Math.floor(picks / 2) });

/** Labels derivable from a log: sniping needs the share of near-certain bets, which the logs do not carry. */
export const LOG_LABELS: XrayLabel[] = ["proven losing record", "proven winning record", "no proven edge", "too early"];

/** The label the wallet would have had from its older half alone, by the same rules as core `xrayLabel` with sniping left out. */
export function labelFromOlderHalf(row: Pick<LogRow, "picks" | "oldZ">): XrayLabel {
  return xrayLabelFromStats({ n: halves(row.picks).nOld, z: row.oldZ, snipingShare: 0 });
}

/** The rules the validation applies, for the report. */
export const LABEL_RULES = {
  losing: { z: XRAY_LOSING_Z, minBets: XRAY_MIN_BETS_LOSING },
  positive: { z: XRAY_POSITIVE_Z, minBets: XRAY_MIN_BETS_POSITIVE },
  tooEarlyBelow: XRAY_MIN_BETS,
};

/** Small seeded generator so the bootstrap intervals are the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/** Percentile bootstrap interval of the mean. Null for fewer than two values. */
export function bootstrapMeanCI(xs: number[], opts: { resamples?: number; level?: number; seed?: number } = {}): [number, number] | null {
  if (xs.length < 2) return null;
  const { resamples = 2000, level = 0.95, seed = 12345 } = opts;
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let b = 0; b < resamples; b++) {
    let s = 0;
    for (let i = 0; i < xs.length; i++) s += xs[Math.floor(rand() * xs.length)]!;
    means.push(s / xs.length);
  }
  means.sort((a, b) => a - b);
  const lo = Math.floor(((1 - level) / 2) * resamples);
  const hi = Math.min(resamples - 1, Math.ceil((1 - (1 - level) / 2) * resamples) - 1);
  return [means[lo]!, means[hi]!];
}

export interface LabelStats {
  label: XrayLabel | "all wallets";
  wallets: number;
  /** Mean edge over the NEWER half, in points (1 point = 1 cent per dollar). Null with no wallets. */
  meanNewEdgePts: number | null;
  ci95Pts: [number, number] | null;
  /** Wallets whose newer-half edge is below zero, and their share. */
  negative: number;
  shareNegative: number | null;
  /** Mean older-half edge, in points, for context. */
  meanOldEdgePts: number | null;
}

export function statsFor(label: LabelStats["label"], rows: LogRow[], seed = 12345): LabelStats {
  const newPts = rows.map((r) => r.newEdge * 100);
  const negative = rows.filter((r) => r.newEdge < 0).length;
  return {
    label, wallets: rows.length,
    meanNewEdgePts: rows.length ? mean(newPts) : null,
    ci95Pts: bootstrapMeanCI(newPts, { seed }),
    negative, shareNegative: rows.length ? negative / rows.length : null,
    meanOldEdgePts: rows.length ? mean(rows.map((r) => r.oldEdge * 100)) : null,
  };
}

export interface PhaseResult {
  phase: string;
  /** Wallets with a result line in the log (wallets with fewer than 10 picks print none). */
  wallets: number;
  labels: LabelStats[];
}

/** Groups the wallets of one phase by the label their older half would have earned and summarises the newer half. */
export function validatePhase(phase: string, rows: LogRow[], opts: { includeTop?: boolean } = {}): PhaseResult {
  const seen = new Set<string>();
  const used = rows.filter((r) => {
    if (r.group === "top" && !opts.includeTop) return false;
    const key = `${r.group}:${r.wallet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const labels = LOG_LABELS.map((label) => statsFor(label, used.filter((r) => labelFromOlderHalf(r) === label)));
  labels.push(statsFor("all wallets", used));
  return { phase, wallets: used.length, labels };
}

/** The phase a log belongs to, from its file name (wide-all.log, skill-persistence-pregame.log, ...). */
export function phaseOfFile(name: string): string | null {
  const base = name.split(/[\\/]/).pop()!.toLowerCase();
  if (base.includes("inplay")) return "inplay";
  if (base.includes("pregame")) return "pregame";
  if (base.includes("all")) return "all";
  return null;
}

const fmt = (x: number | null, d = 1) => (x === null || !Number.isFinite(x) ? "n/a" : `${x >= 0 ? "+" : ""}${x.toFixed(d)}`);

export const PHASE_TITLE: Record<string, string> = {
  all: "All bets", pregame: "Pre-game bets", inplay: "In-play bets",
};

export interface ValidationReport {
  generatedAt: string;
  /** Set when the numbers come from a small sample; shown at the top of the report. */
  preliminary: string | null;
  sources: string[];
  includesTop: boolean;
  rules: typeof LABEL_RULES;
  phases: PhaseResult[];
}

/** Markdown for docs/LABEL_VALIDATION.md. */
export function renderMarkdown(r: ValidationReport): string {
  const out: string[] = [];
  out.push("# Label validation");
  out.push("");
  if (r.preliminary) {
    out.push(`> **Preliminary (${r.preliminary}).** Regenerated from the wide study logs once they are in; do not quote these numbers as findings.`);
    out.push("");
  }
  out.push("Question: does the X-ray label a wallet would have had from its older bets say anything about how it does on its newer bets?");
  out.push("");
  out.push("## Method");
  out.push("");
  out.push(`- Source: the per-wallet lines of the skill-persistence study logs (${r.sources.join(", ")}). Each wallet's bets are split at the middle: the older half is what the X-ray would have known, the newer half is what happened next.`);
  out.push(`- Wallets: ${r.includesTop ? "profit-blind wallets and the top earners" : "the profit-blind sample only (wallets drawn from the same markets, not picked for profit)"}.`);
  out.push(`- Label from the older half, with the rules of the live X-ray: proven losing record = z <= ${r.rules.losing.z} over at least ${r.rules.losing.minBets} bets; proven winning record = z >= ${r.rules.positive.z} over at least ${r.rules.positive.minBets} bets; too early = fewer than ${r.rules.tooEarlyBelow} bets; otherwise no proven edge. "Mostly sniping" cannot be derived from the logs and is left out.`);
  out.push("- Edge: points won above the price paid, per bet, on one pick per market. Mean newer-half edge comes with a percentile bootstrap 95% interval (2,000 resamples over wallets, fixed seed). A wallet counts once, whatever its size.");
  out.push("- n for the label is floor(picks / 2), the size of the older half.");
  out.push("");
  for (const p of r.phases) {
    out.push(`## ${PHASE_TITLE[p.phase] ?? p.phase}`);
    out.push("");
    out.push(`${p.wallets} wallets with a result line.`);
    out.push("");
    out.push("| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |");
    out.push("|---|---:|---:|---:|---|---:|");
    for (const l of p.labels) {
      const ci = l.ci95Pts ? `${fmt(l.ci95Pts[0])} to ${fmt(l.ci95Pts[1])}` : "n/a (fewer than 2 wallets)";
      const share = l.shareNegative === null ? "n/a" : `${Math.round(l.shareNegative * 100)}% (${l.negative}/${l.wallets})`;
      out.push(`| ${l.label} | ${l.wallets} | ${fmt(l.meanOldEdgePts)} | ${fmt(l.meanNewEdgePts)} | ${ci} | ${share} |`);
    }
    out.push("");
  }
  out.push("## How to read this");
  out.push("");
  out.push("- A label is useful only if its newer-half mean sits clearly away from the all-wallets row and its interval excludes it. An interval that spans zero and the all-wallets mean says the label did not separate the groups.");
  out.push("- Groups with few wallets have wide intervals; the interval is the honest part of the table, the mean alone is not.");
  out.push("- Older and newer halves of the same wallet share its style, so this is not a clean out-of-sample trading test; it is the same split the persistence study used.");
  out.push("");
  return out.join("\n");
}
