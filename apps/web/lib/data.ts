import type { AuditVerdict, MoveLabel, OutcomeData, VerdictData, XrayLabel } from "@calibre/core";
import verdictsFile from "../data/verdicts.json";
import outcomesFile from "../data/outcomes.json";
import walletIndexFile from "../data/wallet-index.json";
import memoryFile from "../data/memory.json";
import findingsFile from "../data/findings.json";
import labelValidationFile from "../data/label-validation.json";
import replayFile from "../data/replay.json";

export interface SealedRecord<T> {
  id: string;
  key: string;
  version: number;
  blobId: string;
  walruscan: string;
  summary: string;
  data: T;
}

export interface GradeRow {
  label: MoveLabel;
  n: number;
  forecastBrier: number;
  marketBrier: number;
  gain: number;
}

export interface WalletIndexRow {
  wallet: string;
  league: string;
  edge: number;
  se: number;
  z: number;
  n: number;
  verdict: AuditVerdict;
  updatedAt: string;
  blobId: string | null;
  memoryVersion: number | null;
}

export interface FindingsRow {
  sample: string;
  bets: string;
  wallets: number;
  rho: number;
  p: number;
  note: string | null;
}

export const verdicts = verdictsFile.verdicts as unknown as SealedRecord<VerdictData>[];
export const outcomes = outcomesFile.outcomes as unknown as SealedRecord<OutcomeData>[];
export const grades = outcomesFile.grades as unknown as GradeRow[];
export const walletIndex = walletIndexFile as unknown as {
  generatedAt: string;
  minBets: number;
  totalRows: number;
  totalWallets: number;
  eligibleRows: number;
  verdictCounts: Record<string, number>;
  rows: WalletIndexRow[];
};
export const memory = memoryFile as unknown as {
  generatedAt: string;
  total: number;
  namespaces: { name: string; memories: number; relayerCount: number }[];
  checkpoint: { sequence: string; timestamp: string | null } | null;
  sampleBlobs: { key: string; blobId: string; walruscan: string }[];
};
export interface WideRow {
  bets: string;
  wallets: number;
  rho: number;
  p: string;
  /** Edge of the best third by older edge, in later bets (probability points). */
  best: number;
  /** Edge of the worst third by older edge, in later bets. */
  worst: number;
}

export const findings = findingsFile as unknown as {
  wide: { headline: string; date: string; rows: WideRow[]; readout: string[] };
  title: string;
  corrected: string;
  question: string;
  rows: FindingsRow[];
  readout: string[];
  caveats: string[];
};

export const dataGeneratedAt = verdictsFile.generatedAt;

export const verdictById = (id: string) => verdicts.find((v) => v.id === id);
export const outcomeFor = (verdictKey: string) => outcomes.find((o) => o.data.verdictKey === verdictKey);

export interface ValidationLabel {
  label: XrayLabel;
  wallets: number;
  meanOldEdgePts: number;
  meanNewEdgePts: number;
  ci95Pts: [number, number] | null;
  negative: number;
  shareNegative: number | null;
}

/** The label validation (docs/LABEL_VALIDATION.md): the label from a wallet's older bets against its edge on the newer ones. */
export const labelValidation = labelValidationFile as unknown as {
  generatedAt: string;
  phases: { phase: "all" | "pregame" | "inplay"; wallets: number; labels: ValidationLabel[] }[];
};

/** The square-money replay (research SQUARE_REPORT.md): follow edge of loser-driven moves against clean ones. */
export const replay = replayFile as unknown as {
  generatedAt: string;
  markets: number;
  moves: number;
  labeledMoves: number;
  minMovePts: number;
  windowMinutes: number;
  continuationMinutes: number;
  rows: { group: string; moves: number; followEdgePts: number; ci95Pts: [number, number] }[];
  differencePts: number;
  pOneSided: number;
  byPhase: { phase: string; loserMoves: number; loserEdgePts: number; cleanMoves: number; cleanEdgePts: number }[];
};
