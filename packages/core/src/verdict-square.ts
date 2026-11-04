import type { WalletFlow } from "./attribution";
import { squareMoneyShare, xrayLabelFromStats, type SquareMoney, type XrayLabel } from "./xray";

/** How many of the wallets pushing a move are judged for the square-money share (the same six as the live market X-ray). */
export const SQUARE_TOP_TAKERS = 6;

/** The fields of a wallet-index row the label reads. One row per wallet and league. */
export interface IndexedEdge {
  wallet: string;
  edge: number;
  se: number;
  n: number;
}

/**
 * X-ray label from a wallet's wallet-index rows (one per league), pooled into one record: bets add up, the pooled edge is
 * the bet-weighted mean and its standard error combines the leagues as independent. Rows without a scored bet are ignored,
 * and a wallet with none is not judged (null). The index holds pre-game bets only (recency weighted) and has no sniping share,
 * so this label can say "proven losing record", "too early", "positive record" or "no proven edge", but never "mostly sniping".
 */
export function indexXrayLabel(rows: Pick<IndexedEdge, "edge" | "se" | "n">[]): XrayLabel | null {
  let n = 0, edgeSum = 0, varSum = 0;
  for (const r of rows) {
    if (!(r.n > 0) || !Number.isFinite(r.se) || !Number.isFinite(r.edge)) continue;
    n += r.n;
    edgeSum += r.n * r.edge;
    varSum += (r.n * r.se) ** 2;
  }
  if (n === 0) return null;
  const se = Math.sqrt(varSum) / n;
  const z = se > 0 ? edgeSum / n / se : 0;
  return xrayLabelFromStats({ n, z, snipingShare: 0 });
}

/** A lookup from wallet address to its label from the index; a wallet with no usable row is null (not judged). */
export function walletLabeler(rows: IndexedEdge[]): (wallet: string) => XrayLabel | null {
  const byWallet = new Map<string, IndexedEdge[]>();
  for (const r of rows) {
    const key = r.wallet.toLowerCase();
    byWallet.set(key, [...(byWallet.get(key) ?? []), r]);
  }
  const cache = new Map<string, XrayLabel | null>();
  return (wallet) => {
    const key = wallet.toLowerCase();
    if (!cache.has(key)) cache.set(key, indexXrayLabel(byWallet.get(key) ?? []));
    return cache.get(key) ?? null;
  };
}

export interface VerdictSquare {
  /** Share of the money pushing the move that came from judged wallets with a proven losing record (a floor). */
  squareShare: number;
  /** Share of the money pushing the move that belongs to wallets that were judged at all. */
  squareCoverage: number;
  money: SquareMoney;
}

/**
 * Square money for a sealed verdict, defined as the live market X-ray defines it: the `topN` wallets pushing the move by
 * money are judged and every other pusher counts as not judged, so the coverage says how much of the move the share describes.
 * `labelOf` gives a wallet's label, or null when it is not judged (no index row, so no extra network call is ever made).
 * `direction` is the sign of the move.
 */
export function verdictSquareMoney(
  flows: Pick<WalletFlow, "wallet" | "netYesUsd">[],
  direction: number,
  labelOf: (wallet: string) => XrayLabel | null,
  topN = SQUARE_TOP_TAKERS,
): VerdictSquare {
  const dir = Math.sign(direction) || 1;
  const pushers = flows
    .filter((f) => Math.sign(f.netYesUsd) === dir)
    .sort((a, b) => Math.abs(b.netYesUsd) - Math.abs(a.netYesUsd))
    .slice(0, topN);
  const labels = new Map<string, XrayLabel | null>(pushers.map((f) => [f.wallet, labelOf(f.wallet)]));
  const money = squareMoneyShare(flows, labels, dir);
  return { squareShare: money.share, squareCoverage: money.coverage, money };
}
