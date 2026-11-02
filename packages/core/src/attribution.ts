import { blend } from "./blend.js";
import { clamp } from "./math.js";
import { impliedProb } from "./positions.js";
import { shrunkWeight, type Skill } from "./skill.js";

/** One fill in a market (shape of Tatum's /markets/{id}/trades). */
export interface FlowTrade {
  taker: string;
  side: "yes" | "no";
  direction: "buy" | "sell";
  price: number;
  size: number;
}

export interface WalletFlow {
  wallet: string;
  /** Net bet on YES: positive bullish, negative bearish (USD). */
  netYesUsd: number;
  /** Notional-weighted implied probability of YES behind this wallet's trades. */
  pYes: number;
  weight: number;
  skill?: Pick<Skill, "bss" | "effN">;
}

export type MoveLabel = "sharp-led" | "contested" | "mixed" | "noise";

export interface MoveVerdict {
  label: MoveLabel;
  /** Share of move-aligned money that came from wallets with learned positive skill. */
  sharpShare: number;
  /** Skill-weighted money against the move, relative to skill-weighted money with it. */
  opposition: number;
  forecast: number;
  wallets: WalletFlow[];
}

/** A trade's view on YES: buying YES or selling NO is bullish. Returns signed USD and the implied P(YES). */
export function tradeView(t: FlowTrade, k = 0.25): { yesUsd: number; pYes: number } {
  const bullish = (t.side === "yes") === (t.direction === "buy");
  const yesPrice = t.side === "yes" ? t.price : 1 - t.price;
  const usd = t.price * t.size;
  return { yesUsd: bullish ? usd : -usd, pYes: impliedProb(bullish ? "YES" : "NO", clamp(yesPrice, 0.01, 0.99), k) };
}

export function aggregateFlows(trades: FlowTrade[], skillOf: (wallet: string) => Pick<Skill, "bss" | "effN"> | undefined, n0 = 15): WalletFlow[] {
  const byWallet = new Map<string, { net: number; usd: number; pAcc: number }>();
  for (const t of trades) {
    if (!(t.size > 0) || !(t.price > 0 && t.price < 1)) continue;
    const v = tradeView(t);
    const usd = Math.abs(v.yesUsd);
    const a = byWallet.get(t.taker) ?? { net: 0, usd: 0, pAcc: 0 };
    a.net += v.yesUsd; a.usd += usd; a.pAcc += v.pYes * usd;
    byWallet.set(t.taker, a);
  }
  return [...byWallet].map(([wallet, a]) => {
    const skill = skillOf(wallet);
    return { wallet, netYesUsd: a.net, pYes: a.pAcc / a.usd, skill, weight: skill ? shrunkWeight(skill, n0) : 0 };
  });
}

/**
 * Judge a price move from pBefore to pAfter (YES prices) by who traded it.
 * sharp-led: most money pushing the move came from skilled wallets.
 * contested: skilled wallets bet against the move with comparable weight.
 * noise: almost none of the move came from skilled wallets.
 */
export function judgeMove(pBefore: number, pAfter: number, flows: WalletFlow[], opts: { sharp?: number; noise?: number; alpha?: number } = {}): MoveVerdict {
  const dir = Math.sign(pAfter - pBefore) || 1;
  let aligned = 0, alignedSharp = 0, withSkill = 0, againstSkill = 0;
  for (const f of flows) {
    const usd = Math.abs(f.netYesUsd);
    const isAligned = Math.sign(f.netYesUsd) === dir;
    if (isAligned) { aligned += usd; if (f.weight > 0) alignedSharp += usd; }
    if (f.weight > 0) (isAligned ? (withSkill += f.weight * usd) : (againstSkill += f.weight * usd));
  }
  const sharpShare = aligned > 0 ? alignedSharp / aligned : 0;
  const opposition = withSkill > 0 ? againstSkill / withSkill : againstSkill > 0 ? Infinity : 0;
  const label: MoveLabel =
    opposition >= 0.75 && againstSkill > 0 ? "contested"
    : sharpShare >= (opts.sharp ?? 0.5) ? "sharp-led"
    : sharpShare < (opts.noise ?? 0.15) ? "noise"
    : "mixed";
  const forecast = blend(pAfter, flows.filter((f) => f.weight > 0).map((f) => ({ p: f.pYes, w: f.weight, sourceId: f.wallet })), { alpha: opts.alpha }).p;
  return { label, sharpShare, opposition, forecast, wallets: flows };
}
