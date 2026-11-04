import type { WalletAudit } from "./audit";
import type { WalletFlow } from "./attribution";

/**
 * The X-ray label of a wallet, in the language of sports bettors: a "square" is a bettor who reliably loses, a "sharp" one who
 * reliably beats the price. The 1,000-wallet study found that past losers keep losing (about 2 points per bet) while past
 * winners do not stay ahead, so only the losing label is reliable going forward. The positive label is shown with that caveat.
 */
export type XrayLabel =
  | "proven losing record"
  | "mostly sniping"
  | "too early"
  | "positive record (unproven going forward)"
  | "no proven edge";

/** Overall z at or below this, over at least `XRAY_MIN_BETS_LOSING` bets, is a proven losing record. */
export const XRAY_LOSING_Z = -2;
export const XRAY_MIN_BETS_LOSING = 30;
/** Fewer scored bets than this is too early to call. */
export const XRAY_MIN_BETS = 30;
/** Overall z at or above this, over at least `XRAY_MIN_BETS_POSITIVE` bets, is a positive record. */
export const XRAY_POSITIVE_Z = 2;
export const XRAY_MIN_BETS_POSITIVE = 100;
/** More than this share of resolved markets bought at decided prices is "mostly sniping". */
export const XRAY_SNIPING_SHARE = 0.4;

export type XrayTone = "bad" | "warn" | "muted" | "good";

/** The audit fields the label reads. */
export type XrayInput = Pick<WalletAudit, "n" | "overall" | "sniping">;

/** The numbers behind a label: scored bets, overall z-score, and the share of resolved markets that were sniping. */
export function xrayLabelFromStats(s: { n: number; z: number; snipingShare: number }): XrayLabel {
  if (s.n >= XRAY_MIN_BETS_LOSING && s.z <= XRAY_LOSING_Z) return "proven losing record";
  if (s.snipingShare > XRAY_SNIPING_SHARE) return "mostly sniping";
  if (s.n < XRAY_MIN_BETS) return "too early";
  if (s.z >= XRAY_POSITIVE_Z && s.n >= XRAY_MIN_BETS_POSITIVE) return "positive record (unproven going forward)";
  return "no proven edge";
}

/** Label order: a proven losing record first (the reliable one), then sniping, then too early, then a positive record, else no edge. */
export function xrayLabel(a: XrayInput): XrayLabel {
  return xrayLabelFromStats({ n: a.n, z: a.overall.z, snipingShare: a.sniping.share });
}

export const XRAY_TONE: Record<XrayLabel, XrayTone> = {
  "proven losing record": "bad",
  "mostly sniping": "warn",
  "too early": "muted",
  "positive record (unproven going forward)": "good",
  "no proven edge": "muted",
};

/** The short chip text of each label. The site and the browser extension both read this, so their chips always match. */
export const XRAY_SHORT: Record<XrayLabel, string> = {
  "proven losing record": "Proven losing record",
  "mostly sniping": "Mostly sniping",
  "too early": "Too early",
  "positive record (unproven going forward)": "Positive record (unproven)",
  "no proven edge": "No proven edge",
};

/** Only a losing record is a reliable label: past losers keep losing, past winners do not stay ahead. */
export const isReliableLabel = (label: XrayLabel): boolean => label === "proven losing record";

const pct0 = (p: number) => `${Math.round(p * 100)}%`;
const ptsAbs = (p: number) => `${Math.abs(p * 100).toFixed(1)}`;

/** One plain-English sentence for the label, with the wallet's own numbers. */
export function xraySentence(a: XrayInput): string {
  const label = xrayLabel(a);
  const sniping = a.sniping.share;
  const snipeText = `${pct0(sniping)} of its resolved bets were near-certain outcomes (97 cents or more, or 3 cents or less)`;
  switch (label) {
    case "proven losing record":
      return `Proven losing record. Over ${a.n} bets it won ${ptsAbs(a.overall.edge)} points less often than the prices it paid implied (z ${a.overall.z.toFixed(1)}). In our study of 1,000 wallets, past losers kept losing by about 2 points per bet.`;
    case "mostly sniping":
      return `Mostly sniping. ${snipeText}, which earns a steady sliver that looks like skill but is not forecasting. Copying this wallet would mostly copy bets on decided games.`;
    case "too early":
      return `Too early to call: only ${a.n} scored ${a.n === 1 ? "bet" : "bets"}, fewer than ${XRAY_MIN_BETS}.`;
    case "positive record (unproven going forward)":
      return `Positive record: ${a.overall.edge >= 0 ? "+" : "-"}${ptsAbs(a.overall.edge)} points over ${a.n} bets (z ${a.overall.z.toFixed(1)}). Our study found past winners rarely stay ahead, so this does not show the edge will continue.`;
    default:
      return sniping >= 0.2
        ? `No proven edge. ${snipeText}: copying this wallet would mostly copy luck.`
        : `No proven edge. Its record over ${a.n} bets (${a.overall.edge >= 0 ? "+" : "-"}${ptsAbs(a.overall.edge)} points, z ${a.overall.z.toFixed(1)}) is within what luck produces: copying this wallet would mostly copy luck.`;
  }
}

export interface SquareMoney {
  /** Notional (USD) pushing the move, summed over all wallets, judged or not. */
  alignedUsd: number;
  /** The part of it from wallets that were audited and have a label. */
  judgedUsd: number;
  /** The part of it from wallets labeled "proven losing record". */
  squareUsd: number;
  /** squareUsd / alignedUsd: a floor, because wallets that were not audited count as zero. */
  share: number;
  /** squareUsd / judgedUsd: the share among the money that could be judged; null when none could be. */
  shareOfJudged: number | null;
  /** judgedUsd / alignedUsd: how much of the move-aligned money the labels cover. */
  coverage: number;
  /** Wallets pushing the move, and those labeled proven losing. */
  wallets: number;
  squareWallets: number;
}

/**
 * Share of the money pushing a move that came from wallets labeled "proven losing record". `direction` is the sign of the
 * move (positive up, negative down); only wallets whose net bet points the same way count. `labels` maps a wallet to its
 * label, and a wallet that is missing or null was not judged: its money is in `alignedUsd` but not in `judgedUsd`, so
 * `coverage` says how much of the move the share actually describes.
 */
export function squareMoneyShare(
  flows: Pick<WalletFlow, "wallet" | "netYesUsd">[],
  labels: ReadonlyMap<string, XrayLabel | null | undefined> | Record<string, XrayLabel | null | undefined>,
  direction: number,
): SquareMoney {
  const dir = Math.sign(direction) || 1;
  const labelOf = (w: string) => (labels instanceof Map ? labels.get(w) : (labels as Record<string, XrayLabel | null | undefined>)[w]);
  let alignedUsd = 0, judgedUsd = 0, squareUsd = 0, wallets = 0, squareWallets = 0;
  for (const f of flows) {
    if (Math.sign(f.netYesUsd) !== dir) continue;
    const usd = Math.abs(f.netYesUsd);
    alignedUsd += usd;
    wallets++;
    const label = labelOf(f.wallet);
    if (!label) continue;
    judgedUsd += usd;
    if (label === "proven losing record") { squareUsd += usd; squareWallets++; }
  }
  return {
    alignedUsd, judgedUsd, squareUsd,
    share: alignedUsd > 0 ? squareUsd / alignedUsd : 0,
    shareOfJudged: judgedUsd > 0 ? squareUsd / judgedUsd : null,
    coverage: alignedUsd > 0 ? judgedUsd / alignedUsd : 0,
    wallets, squareWallets,
  };
}

/**
 * The caution line for a move. It describes who pushed the price and never recommends a trade: whether moves pushed by
 * losing wallets tend to reverse is a pending study, not a finding.
 */
export function squareMoneyNote(s: SquareMoney): string {
  if (s.alignedUsd <= 0) return "No money pushing the move could be measured.";
  const covered = `${Math.round(s.coverage * 100)}% of the money pushing this move could be judged`;
  if (s.judgedUsd <= 0) return `${covered}, so there is nothing to say about who pushed it.`;
  if (s.squareUsd <= 0) return `None of the judged money came from wallets with a proven losing record (${covered}). That does not make the move sharp: most wallets have no proven edge either way.`;
  return `${Math.round((s.shareOfJudged ?? 0) * 100)}% of the judged money came from wallets with a proven losing record (${Math.round(s.share * 100)}% of all the money pushing the move; ${covered}). A caution signal, not a trade recommendation: whether such moves reverse has not been shown.`;
}
