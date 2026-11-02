import { brier, type Outcome } from "./brier.js";
import { DAY_MS, decayWeight } from "./math.js";

/** One resolved pick: what the source believed, what the market said at the same time, and what happened. */
export interface ScoredPick {
  pSrc: number;
  pMkt: number;
  y: Outcome;
  /** Pick time, epoch ms. */
  ts: number;
}

export interface SkillOptions {
  /** Recency half-life in days; Infinity disables decay. Default 30. */
  halfLifeDays?: number;
  /** Reference time for decay, epoch ms. Default: latest pick time. */
  now?: number;
}

export interface Skill {
  /** Brier skill score vs the market price: > 0 means the source adds information beyond the market. */
  bss: number;
  n: number;
  /** Decay-weighted effective sample size. */
  effN: number;
  brierSrc: number;
  brierMkt: number;
}

/**
 * Skill relative to the market at the time of each pick.
 * Raw Brier rewards people who only back favourites; this measures edge over the price.
 */
export function brierSkill(picks: ScoredPick[], opts: SkillOptions = {}): Skill {
  const n = picks.length;
  if (n === 0) return { bss: 0, n: 0, effN: 0, brierSrc: NaN, brierMkt: NaN };
  const halfLife = opts.halfLifeDays ?? 30;
  const now = opts.now ?? Math.max(...picks.map((p) => p.ts));

  let wSum = 0, w2Sum = 0, src = 0, mkt = 0;
  for (const p of picks) {
    const w = decayWeight((now - p.ts) / DAY_MS, halfLife);
    wSum += w;
    w2Sum += w * w;
    src += w * brier(p.pSrc, p.y);
    mkt += w * brier(p.pMkt, p.y);
  }
  const brierSrc = src / wSum;
  const brierMkt = mkt / wSum;
  const effN = (wSum * wSum) / w2Sum;

  let bss: number;
  if (brierMkt === 0) bss = brierSrc === 0 ? 0 : -1;
  else bss = Math.max(-1, 1 - brierSrc / brierMkt);

  return { bss, n, effN, brierSrc, brierMkt };
}

/**
 * Shrink skill toward zero for small samples, so three lucky calls never make a guru.
 * n0 is the prior strength (number of picks at which the evidence counts half).
 */
export function shrunkWeight(skill: Pick<Skill, "bss" | "effN">, n0 = 15): number {
  if (skill.effN <= 0) return 0;
  return Math.max(0, skill.bss) * (skill.effN / (skill.effN + n0));
}
