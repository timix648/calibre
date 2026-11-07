import type { AuditVerdict, MoveLabel } from "@calibre/core";

export const pct = (p: number, digits = 0) => `${(p * 100).toFixed(digits)}%`;

/** Probability points with a sign: 0.032 becomes +3.2. */
export function pts(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return "n/a";
  const v = p * 100;
  return `${v >= 0 ? "+" : "-"}${Math.abs(v).toFixed(digits)}`;
}

export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

export function utc(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "n/a";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "n/a";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const walruscan = (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`;
export const suiscanCheckpoint = (seq: string) => `https://suiscan.xyz/mainnet/checkpoint/${seq}`;

export const VERDICT_TONE: Record<AuditVerdict, "good" | "bad" | "muted" | "warn"> = {
  "proven edge": "good",
  "negative edge": "bad",
  "no proven edge (consistent with luck)": "muted",
  "too early": "warn",
};

export const MOVE_LABEL_TEXT: Record<MoveLabel, string> = {
  "sharp-led": "Most of the money behind the move came from wallets with a positive learned edge.",
  contested: "Wallets with a positive learned edge were betting against the move.",
  mixed: "Some of the money behind the move came from wallets with a positive learned edge.",
  noise: "Almost none of the money behind the move came from wallets with a positive learned edge.",
};

export function sourceLabel(source: string | undefined): string {
  return source === "polymarket-public" ? "Polymarket public API (fallback)" : "Tatum Prediction Markets API";
}

/**
 * What the fills say, and separately whether Tatum confirmed the move. The two differ: Tatum's trades endpoint returns
 * nothing for Polymarket, so a move Tatum's price history confirmed still carries Polymarket fills, and saying only
 * "Polymarket public API" would undersell what actually happened.
 */
export function evidenceLabel(v: { source?: string; moveConfirmedBy?: string }): string {
  const fills = sourceLabel(v.source);
  return v.moveConfirmedBy === "tatum" ? `Move confirmed on Tatum price history; fills from ${fills.replace(" (fallback)", "")}` : fills;
}

/** "45 min" or "2 h 10 min" for a span in milliseconds. */
export function span(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}`;
}

export const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
