import { describe, expect, it } from "vitest";
import {
  MODEL_VERSION, MODEL_VERSIONS, SQUARE_TOP_TAKERS, indexXrayLabel, verdictRecord, verdictSquare, verdictSquareMoney, walletLabeler,
  type VerdictData, type XrayLabel,
} from "../src/index.js";
import { decode, encode } from "../../memory/src/index.js";

const row = (wallet: string, edge: number, se: number, n: number) => ({ wallet, edge, se, n });

describe("indexXrayLabel", () => {
  it("calls a pooled record with z of -2 or lower over 30+ bets a proven losing record", () => {
    // 100 bets at -8 points with a 3-point standard error: z about -2.7.
    expect(indexXrayLabel([row("w", -0.08, 0.03, 100)])).toBe("proven losing record");
  });
  it("pools leagues: two leagues that are each only suggestive can add up to a proven loss", () => {
    const a = row("w", -0.07, 0.04, 60); // z -1.75
    const b = row("w", -0.07, 0.04, 60); // z -1.75
    expect(indexXrayLabel([a])).toBe("no proven edge");
    expect(indexXrayLabel([a, b])).toBe("proven losing record"); // pooled se 0.04 / sqrt(2): z about -2.5
  });
  it("is too early under 30 pooled bets, and a positive record only at z >= 2 over 100+ bets", () => {
    expect(indexXrayLabel([row("w", -0.3, 0.05, 12)])).toBe("too early");
    expect(indexXrayLabel([row("w", 0.1, 0.04, 150)])).toBe("proven winning record");
    expect(indexXrayLabel([row("w", 0.1, 0.04, 90)])).toBe("no proven edge");
  });
  it("never says mostly sniping: the index has no sniping share", () => {
    const labels = [indexXrayLabel([row("w", -0.09, 0.03, 200)]), indexXrayLabel([row("w", 0.0, 0.03, 200)]), indexXrayLabel([row("w", 0.1, 0.03, 200)])];
    expect(labels).not.toContain("mostly sniping");
  });
  it("does not judge a wallet with no scored bet, and ignores retired rows", () => {
    expect(indexXrayLabel([])).toBeNull();
    expect(indexXrayLabel([row("w", 0, 0, 0)])).toBeNull();
    expect(indexXrayLabel([row("w", 0, Infinity, 0), row("w", -0.08, 0.03, 100)])).toBe("proven losing record");
  });
});

describe("walletLabeler", () => {
  it("looks wallets up without regard to case and returns null for wallets outside the index", () => {
    const labelOf = walletLabeler([row("0xAbC", -0.08, 0.03, 100), row("0xdef", 0, 0.03, 100)]);
    expect(labelOf("0xabc")).toBe("proven losing record");
    expect(labelOf("0xDEF")).toBe("no proven edge");
    expect(labelOf("0x999")).toBeNull();
  });
});

describe("verdictSquareMoney", () => {
  const labels: Record<string, XrayLabel | null> = { a: "proven losing record", b: "no proven edge", c: null, d: "proven losing record" };
  const labelOf = (w: string) => labels[w] ?? null;

  it("is the share of the pushing money from proven losers, with the coverage of the judged money", () => {
    const flows = [
      { wallet: "a", netYesUsd: 300 }, // square
      { wallet: "b", netYesUsd: 500 }, // judged, no record
      { wallet: "c", netYesUsd: 200 }, // not in the index
      { wallet: "x", netYesUsd: -900 }, // against the move: ignored
    ];
    const v = verdictSquareMoney(flows, 1, labelOf);
    expect(v.squareShare).toBeCloseTo(0.3); // 300 of 1000
    expect(v.squareCoverage).toBeCloseTo(0.8); // a and b judged
    expect(v.money.squareWallets).toBe(1);
  });

  it("reads a move down from the sellers", () => {
    const v = verdictSquareMoney([{ wallet: "a", netYesUsd: -400 }, { wallet: "b", netYesUsd: -100 }, { wallet: "z", netYesUsd: 700 }], -1, labelOf);
    expect(v.squareShare).toBeCloseTo(0.8);
    expect(v.squareCoverage).toBeCloseTo(1);
  });

  it("judges only the top pushers by money; the rest count as not judged", () => {
    const flows = Array.from({ length: 8 }, (_, i) => ({ wallet: i === 7 ? "d" : `p${i}`, netYesUsd: 100 - i }));
    const v = verdictSquareMoney(flows, 1, (w) => (w === "d" ? "proven losing record" : "no proven edge"));
    expect(SQUARE_TOP_TAKERS).toBe(6);
    // p0..p5 are judged (100+99+98+97+96+95 = 585 of 100+99+...+93 = 772); d, the smallest pusher, is outside the top six.
    expect(v.squareShare).toBe(0);
    expect(v.squareCoverage).toBeCloseTo(585 / 772, 6);
  });

  it("is zero, not NaN, when nobody pushed", () => {
    const v = verdictSquareMoney([{ wallet: "a", netYesUsd: -5 }], 1, labelOf);
    expect(v.squareShare).toBe(0);
    expect(v.squareCoverage).toBe(0);
  });
});

describe("model v3 verdicts and older ones", () => {
  const base = {
    marketId: "m", eventSlug: "e", league: "nba", question: "Q?", yesOutcome: "A", move: { from: 0.5, to: 0.6, startTs: 1, endTs: 2 },
    label: "noise", sharpShare: 0, opposition: null, forecast: 0.6, priceAtVerdict: 0.6, trades: 1, wallets: 1,
    topWallets: [{ wallet: "0xa", league: "nba", netYesUsd: 100, edge: 0, z: -2.4, n: 80, blobId: null, label: "proven losing record" as const }],
    checkpoint: { sequence: "1", digest: null, timestamp: null }, sealedAt: "x",
  } satisfies Omit<VerdictData, "model">;

  it("is v3 for new verdicts and every version stays listed", () => {
    expect(MODEL_VERSION).toBe("v3");
    expect(MODEL_VERSIONS).toEqual(["v1", "v2", "v3"]);
  });

  it("carries the square-money fields and the per-taker labels through the sealed envelope", () => {
    const d: VerdictData = { ...base, model: "v3", squareShare: 0.25, squareCoverage: 0.75 };
    const record = verdictRecord(d);
    expect(record.summary).toContain("Square money 25% of the money pushing the move (judged 75%)");
    const back = decode(encode(record))!.data as unknown as VerdictData;
    expect(back.model).toBe("v3");
    expect(back.squareShare).toBe(0.25);
    expect(back.squareCoverage).toBe(0.75);
    expect(back.topWallets[0]!.label).toBe("proven losing record");
    expect(verdictSquare(back)).toEqual({ share: 0.25, coverage: 0.75 });
  });

  it("keeps v1 and v2 verdicts readable: no square money, no labels, same summary as before", () => {
    const v1 = { ...base, topWallets: [{ ...base.topWallets[0]!, label: undefined }] } as VerdictData;
    const v2: VerdictData = { ...v1, model: "v2" };
    for (const d of [v1, v2]) {
      expect(verdictSquare(d)).toBeNull();
      const record = verdictRecord(d);
      expect(record.summary).not.toContain("Square money");
      const back = decode(encode(record))!.data as unknown as VerdictData;
      expect(back.topWallets[0]!.label).toBeUndefined();
    }
  });

  it("still reads the older squareMoney shape", () => {
    expect(verdictSquare({ squareMoney: { share: 0.1, coverage: 0.5 } })).toEqual({ share: 0.1, coverage: 0.5 });
  });
});
