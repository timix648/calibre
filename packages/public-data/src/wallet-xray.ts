import { XRAY_TONE, isReliableLabel, xrayLabel, xraySentence, type XrayLabel, type XrayTone } from "@calibre/core";
import type { WalletAuditResult } from "./audit";

export interface WalletXray extends WalletAuditResult {
  /** Set by the server that ran the X-ray: the Sui checkpoint it was read at. */
  anchor?: import("./market").XrayAnchor | null;
  /** Tatum's Prediction Markets API view of the wallet, when the server could ask it. */
  tatum?: { openValueUsd: number | null; marketsTraded: number | null; source: "tatum" } | null;
  xray: {
    label: XrayLabel;
    tone: XrayTone;
    /** True only for a proven losing record: the one label that holds going forward. */
    reliable: boolean;
    sentence: string;
    /** How far the proven winning record held up in testing; null for the other labels. */
    caveat: string | null;
  };
}

export const WINNING_CAVEAT = "Rare and modest. In a test of 1,000 wallets, those with this record stayed ahead by +2.2 pts per bet on average afterwards (interval +0.5 to +4.1), mostly from in-play bets; pre-game bets alone did not show it.";

/** A wallet audit with its X-ray label, plain-English sentence and reliability flag. */
export function toWalletXray(result: WalletAuditResult): WalletXray {
  const label = xrayLabel(result.audit);
  return {
    ...result,
    xray: {
      label,
      tone: XRAY_TONE[label],
      reliable: isReliableLabel(label),
      sentence: xraySentence(result.audit),
      caveat: label === "proven winning record" ? WINNING_CAVEAT : null,
    },
  };
}
