import { blend } from "./blend.js";
import { shrunkEdge, type Edge } from "./edge.js";
import { clamp } from "./math.js";

/** One fill in a market (shape of Tatum's /markets/{id}/trades). */
export interface FlowTrade {
  taker: string;
  side: "yes" | "no";
  direction: "buy" | "sell";
  price: number;
  size: number;
}

export type WalletSkill = Pick<Edge, "edge" | "effN">;

export interface WalletFlow {
  wallet: string;
  /** Net bet on YES: positive bullish, negative bearish (USD). */
  netYesUsd: number;
  /** Notional-weighted YES-equivalent price this wallet traded at. */
  avgYesPrice: number;
  /** Learned edge after shrinkage (probability points); 0 for unknown wallets. */
  edge: number;
  /** This wallet's view of P(YES): its price shifted by its learned edge in the direction it bet. */
  pYes: number;
  skill?: WalletSkill;
}

export type MoveLabel = "sharp-led" | "contested" | "mixed" | "noise";

export interface MoveVerdict {
  label: MoveLabel;
  /** Share of move-aligned money that came from wallets with positive learned edge. */
  sharpShare: number;
  /** Edge-weighted money against the move, relative to edge-weighted money with it. */
  opposition: number;
  forecast: number;
  wallets: WalletFlow[];
}

/** A trade's view on YES: buying YES or selling NO is bullish. */
export function tradeView(t: FlowTrade): { yesUsd: number; yesPrice: number } {
  const bullish = (t.side === "yes") === (t.direction === "buy");
  const usd = t.price * t.size;
  return { yesUsd: bullish ? usd : -usd, yesPrice: t.side === "yes" ? t.price : 1 - t.price };
}

export function aggregateFlows(trades: FlowTrade[], skillOf: (wallet: string) => WalletSkill | undefined, n0 = 30): WalletFlow[] {
  const byWallet = new Map<string, { net: number; usd: number; pAcc: number }>();
  for (const t of trades) {
    if (!(t.size > 0) || !(t.price > 0 && t.price < 1)) continue;
    const v = tradeView(t);
    const usd = Math.abs(v.yesUsd);
    const a = byWallet.get(t.taker) ?? { net: 0, usd: 0, pAcc: 0 };
    a.net += v.yesUsd; a.usd += usd; a.pAcc += v.yesPrice * usd;
    byWallet.set(t.taker, a);
  }
  return [...byWallet].map(([wallet, a]) => {
    const skill = skillOf(wallet);
    const edge = skill ? Math.max(0, shrunkEdge(skill, n0)) : 0;
    const avgYesPrice = a.pAcc / a.usd;
    const pYes = clamp(avgYesPrice + Math.sign(a.net) * edge, 0.01, 0.99);
    return { wallet, netYesUsd: a.net, avgYesPrice, edge, pYes, skill };
  });
}

/**
 * Judge a price move from pBefore to pAfter (YES prices) by who traded it.
 * sharp-led: most money pushing the move came from wallets with learned positive edge.
 * contested: such wallets bet against the move with comparable weight.
 * noise: almost none of the move came from them.
 * The forecast pools skilled wallets' views around the new price, weighted by their share of skilled money.
 */
export function judgeMove(pBefore: number, pAfter: number, flows: WalletFlow[], opts: { sharp?: number; noise?: number; alpha?: number } = {}): MoveVerdict {
  const dir = Math.sign(pAfter - pBefore) || 1;
  let aligned = 0, alignedSharp = 0, withSkill = 0, againstSkill = 0, skilledUsd = 0;
  for (const f of flows) {
    const usd = Math.abs(f.netYesUsd);
    const isAligned = Math.sign(f.netYesUsd) === dir;
    if (isAligned) { aligned += usd; if (f.edge > 0) alignedSharp += usd; }
    if (f.edge > 0) {
      skilledUsd += usd;
      if (isAligned) withSkill += f.edge * usd; else againstSkill += f.edge * usd;
    }
  }
  const sharpShare = aligned > 0 ? alignedSharp / aligned : 0;
  const opposition = withSkill > 0 ? againstSkill / withSkill : againstSkill > 0 ? Infinity : 0;
  const label: MoveLabel =
    againstSkill > 0 && opposition >= 0.75 ? "contested"
    : sharpShare >= (opts.sharp ?? 0.5) ? "sharp-led"
    : sharpShare < (opts.noise ?? 0.15) ? "noise"
    : "mixed";
  const signals = flows
    .filter((f) => f.edge > 0 && skilledUsd > 0)
    .map((f) => ({ p: f.pYes, w: Math.abs(f.netYesUsd) / skilledUsd, sourceId: f.wallet }));
  const forecast = blend(pAfter, signals, { alpha: opts.alpha ?? 1 }).p;
  return { label, sharpShare, opposition, forecast, wallets: flows };
}
