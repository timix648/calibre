/** Fewer bets than this and a wallet's edge is too noisy to call. */
export const MIN_BETS_FOR_VERDICT = 30;

export type SkillVerdict = "skill" | "negative edge" | "too early" | "luck / unproven";

/**
 * Plain-words call on a wallet's edge against the price it paid.
 * Small samples are "too early" whatever their z-score; otherwise |z| >= 2 separates skill from luck.
 */
export function skillVerdict(e: { z: number; n: number }): SkillVerdict {
  if (e.n < MIN_BETS_FOR_VERDICT) return "too early";
  if (e.z >= 2) return "skill";
  if (e.z <= -2) return "negative edge";
  return "luck / unproven";
}

/** The verdict as it reads inside a memory summary. */
export function skillPhrase(v: SkillVerdict): string {
  return v === "skill" ? "likely skill" : v;
}

export function leagueLabel(league: string): string {
  return league.toUpperCase();
}

/** `0xabcdef…ef01`: enough of an address to recognise it. */
export function shortAddress(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 8)}…${wallet.slice(-4)}` : wallet;
}

export function formatPoints(prob: number, digits = 1): string {
  const pts = prob * 100;
  return `${pts >= 0 ? "+" : ""}${pts.toFixed(digits)} pts`;
}
