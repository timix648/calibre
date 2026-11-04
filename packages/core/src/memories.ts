import type { ModelVersion, MoveLabel } from "./attribution";
import type { Edge } from "./edge";
import type { XrayLabel } from "./xray";
import type { Grade } from "./grading";
import type { DataSource } from "./fallback";
import { formatPoints, leagueLabel, shortAddress, skillPhrase, skillVerdict, type SkillVerdict } from "./wording";

/** Same shape as the memory package's Envelope, so core stays dependency-free. */
export interface MemoryRecord<T> {
  kind: string;
  key: string;
  version: number;
  summary: string;
  data: T;
}

/** An edge must move by this much (probability points) before a wallet memory gets a new version. */
export const REVERSION_THRESHOLD = 0.005;

export interface WalletEdgeRow extends Edge {
  wallet: string;
  league: string;
  updatedAt: string;
}

export interface WalletMemoryData extends WalletEdgeRow {
  verdict: SkillVerdict;
}

export const walletKey = (wallet: string, league: string) => `${wallet.toLowerCase()}:${league.toLowerCase()}`;

export function needsNewVersion(previousEdge: number | undefined, edge: number): boolean {
  return previousEdge === undefined || Math.abs(edge - previousEdge) >= REVERSION_THRESHOLD;
}

/**
 * Zero-bet rows for wallet memories whose evidence is gone: a key that has a memory but no longer has a single scorable bet
 * (every one was in-play, at an extreme price or in a junk category). Written as "too early", they stop the newest version of
 * that key from claiming an edge. Only wallets scored in this run are considered (`scored.politics` for the politics keys).
 */
export function retiredWalletRows(
  memoryKeys: string[], rows: Pick<WalletEdgeRow, "wallet" | "league">[], scored: { sports: Set<string>; politics: Set<string> }, updatedAt: string,
): WalletEdgeRow[] {
  const present = new Set(rows.map((r) => walletKey(r.wallet, r.league)));
  const out: WalletEdgeRow[] = [];
  for (const key of memoryKeys) {
    if (present.has(key)) continue;
    const cut = key.indexOf(":");
    const wallet = key.slice(0, cut), league = key.slice(cut + 1);
    if (!(league === "politics" ? scored.politics : scored.sports).has(wallet)) continue;
    out.push({ wallet, league, edge: 0, se: 0, z: 0, n: 0, effN: 0, updatedAt });
  }
  return out;
}

export function walletRecord(row: WalletEdgeRow, version: number): MemoryRecord<WalletMemoryData> {
  const verdict = skillVerdict(row);
  return {
    kind: "wallet",
    key: walletKey(row.wallet, row.league),
    version,
    summary: `Wallet ${shortAddress(row.wallet)} has ${formatPoints(row.edge)} edge on ${leagueLabel(row.league)} over ${row.n} bets (z ${row.z.toFixed(1)}): ${skillPhrase(verdict)}`,
    data: { ...row, verdict },
  };
}

export interface VerdictWallet {
  wallet: string;
  league: string;
  /** Net bet on YES in this move, USD. */
  netYesUsd: number;
  /** Learned edge after shrinkage, probability points. */
  edge: number;
  z: number | null;
  n: number | null;
  /** Blob of the wallet memory this verdict relied on, when one exists. */
  blobId: string | null;
  /** X-ray label from the wallet index when the verdict was sealed (model v3); null when the wallet had no index row, absent before v3. */
  label?: XrayLabel | null;
}

export interface VerdictData {
  marketId: string;
  eventSlug: string;
  league: string;
  question: string;
  /** The outcome that the YES price refers to. */
  yesOutcome: string;
  move: { from: number; to: number; startTs: number; endTs: number };
  label: MoveLabel;
  sharpShare: number;
  /** Null when no skilled money was aligned with the move (infinite ratio). */
  opposition: number | null;
  forecast: number;
  /** Market price at the end of the move, the baseline the grader compares against. */
  priceAtVerdict: number;
  trades: number;
  wallets: number;
  topWallets: VerdictWallet[];
  checkpoint: { sequence: string; digest: string | null; timestamp: string | null };
  sealedAt: string;
  /** Judging model that produced the forecast. Verdicts sealed before the field existed were judged by v1. */
  model?: ModelVersion;
  /** Where the market data behind the verdict came from (verdicts sealed before the fallback existed omit it: Tatum). */
  source?: DataSource;
  /** Why Polymarket public data was used instead of Tatum, present when `source` is `polymarket-public`. */
  fallbackReason?: string;
  /** Model v3: share of the money pushing the move that came from judged wallets with a proven losing record (a floor). */
  squareShare?: number;
  /** Model v3: share of the money pushing the move that belongs to wallets judged from the wallet index. */
  squareCoverage?: number;
  /** Older shape of the same two numbers. No sealed verdict is known to carry it; readers still accept it. */
  squareMoney?: { share: number; coverage: number };
}

/** Square money of a verdict, whichever shape recorded it; null for verdicts sealed before it was measured (v1 and v2). */
export function verdictSquare(d: Pick<VerdictData, "squareShare" | "squareCoverage" | "squareMoney">): { share: number; coverage: number } | null {
  if (typeof d.squareShare === "number" && typeof d.squareCoverage === "number") return { share: d.squareShare, coverage: d.squareCoverage };
  return d.squareMoney ?? null;
}

export const verdictKey = (marketId: string, moveEndTs: number) => `${marketId}:${Math.floor(moveEndTs / 1000)}`;

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function verdictRecord(d: VerdictData): MemoryRecord<VerdictData> {
  const square = verdictSquare(d);
  const dir = d.move.to >= d.move.from ? "up" : "down";
  const why: Record<MoveLabel, string> = {
    "sharp-led": `${pct(d.sharpShare)} of the money behind it came from wallets with a learned edge`,
    contested: "wallets with a learned edge were betting against it",
    mixed: `${pct(d.sharpShare)} of the money behind it came from wallets with a learned edge`,
    noise: `only ${pct(d.sharpShare)} of the money behind it came from wallets with a learned edge`,
  };
  return {
    kind: "verdict",
    key: verdictKey(d.marketId, d.move.endTs),
    version: 1,
    summary: `${d.league.toUpperCase()} move ${dir} on "${d.question}" (${d.yesOutcome} ${pct(d.move.from)} to ${pct(d.move.to)}) is ${d.label}: ${why[d.label]}. CALIBRE forecast ${pct(d.forecast)} for ${d.yesOutcome}${square ? `. Square money ${pct(square.share)} of the money pushing the move (judged ${pct(square.coverage)})` : ""}${d.source === "polymarket-public" ? `. Data: Polymarket public API (${d.fallbackReason ?? "Tatum unavailable"})` : ""}`,
    data: d,
  };
}

export interface OutcomeData {
  verdictKey: string;
  marketId: string;
  question: string;
  label: MoveLabel;
  resolution: string;
  yesWon: 0 | 1;
  forecast: number;
  priceAtVerdict: number;
  grade: Grade;
  gradedAt: string;
  /** Judging model of the verdict this grades (absent: v1). */
  model?: ModelVersion;
}

export function outcomeRecord(d: OutcomeData): MemoryRecord<OutcomeData> {
  const beat = d.grade.gain > 0 ? "beat" : d.grade.gain < 0 ? "lost to" : "tied";
  return {
    kind: "outcome",
    key: d.verdictKey,
    version: 1,
    summary: `"${d.question}" resolved ${d.resolution}. The ${d.label} verdict forecast ${pct(d.forecast)} (Brier ${d.grade.forecastBrier.toFixed(3)}) and ${beat} the market price ${pct(d.priceAtVerdict)} (Brier ${d.grade.marketBrier.toFixed(3)})`,
    data: d,
  };
}
