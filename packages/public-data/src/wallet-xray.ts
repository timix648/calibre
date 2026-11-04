import { XRAY_TONE, isReliableLabel, xrayLabel, xraySentence, type XrayLabel, type XrayTone } from "@calibre/core";
import type { WalletAuditResult } from "./audit";

export interface WalletXray extends WalletAuditResult {
  xray: {
    label: XrayLabel;
    tone: XrayTone;
    /** True only for a proven losing record: the one label that holds going forward. */
    reliable: boolean;
    sentence: string;
    /** Why a positive record is not a recommendation; null for the other labels. */
    caveat: string | null;
  };
}

export const POSITIVE_CAVEAT = "Past winners rarely stay ahead: in a study of 1,000 wallets the best third broke even afterwards.";

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
      caveat: label === "positive record (unproven going forward)" ? POSITIVE_CAVEAT : null,
    },
  };
}
