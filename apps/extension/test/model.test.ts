import { describe, expect, it } from "vitest";
import { marketModel, walletModel } from "../src/model";

const edge = { edge: -0.05, se: 0.02, z: -2.5, n: 120, effN: 120, low: -0.09, high: -0.01, verdict: "negative edge" as const };
const wallet = {
  address: "0x684baa57c338c2549aec0aa3f034f695d72a8409", name: "bob", tradesFetched: 300, truncated: false, firstTradeAt: 1, lastTradeAt: 2, fetchedAt: "", source: "polymarket-public" as const,
  audit: { n: 120, overall: edge, pregame: edge, inplay: edge, sniping: { markets: 5, resolvedMarkets: 120, share: 0.04, edge }, leagues: [], verdict: "negative edge" as const, flags: [], trades: 300, tradesInResolvedMarkets: 250 },
  xray: { label: "proven losing record" as const, tone: "bad" as const, reliable: true, sentence: "Proven losing record. Over 120 bets...", caveat: null },
};

describe("walletModel", () => {
  it("shows the chip, the sentence and the numbers", () => {
    const m = walletModel(wallet);
    expect(m.chip).toEqual({ text: "Proven losing record", tone: "bad" });
    expect(m.lead).toContain("Proven losing record");
    expect(m.stats.map((s) => s.label)).toEqual(["Scored bets", "Edge", "Sniping"]);
    expect(m.stats[1]!.value).toBe("-5.0 ± 4.0");
    expect(m.more!.sitePath).toBe(`/wallet/${wallet.address}`);
  });
  it("shows a proven winning record with what testing found", () => {
    const m = walletModel({ ...wallet, xray: { label: "proven winning record", tone: "good", reliable: false, sentence: "Proven winning record...", caveat: "Rare and modest." } });
    expect(m.chip!.text).toBe("Proven winning record");
    expect(m.notes.join(" ")).toContain("Rare and modest.");
    expect(m.notes.join(" ")).toContain("rare; stayed ahead modestly in testing (+2.2 pts next)");
  });
  it("explains a wallet without trades", () => {
    const m = walletModel({ ...wallet, tradesFetched: 0 });
    expect(m.chip).toBeUndefined();
    expect(m.lead).toContain("No trades found");
  });
});

const market = {
  market: { conditionId: "0x1", slug: "e", eventSlug: "e", question: "Ducks vs. Canucks", yesOutcome: "Ducks", noOutcome: "Canucks", yesPrice: 0.9, closed: false, url: "u" },
  move: { from: 0.62, to: 0.86, points: 24, direction: "up" as const, startTs: 1, endTs: 2, fills: 100, settling: false },
  noMoveReason: null,
  takers: [
    { address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", name: "alice", pushed: "Ducks", netUsd: 3900, avgYesPrice: 0.7, label: "proven losing record" as const, tone: "bad" as const, reliable: true, sentence: "s", audit: null, status: "audited" as const },
    { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", name: null, pushed: "Ducks", netUsd: 1200, avgYesPrice: 0.7, label: null, tone: null, reliable: false, sentence: null, audit: null, status: "pending" as const },
  ],
  squareMoney: { alignedUsd: 10000, judgedUsd: 6000, squareUsd: 3900, share: 0.39, shareOfJudged: 0.65, coverage: 0.6, wallets: 20, squareWallets: 1, note: "A caution signal, not a trade recommendation." },
  caution: "Square money is a caution signal, not a trade recommendation.",
  fills: { read: 100, pages: 1, oldestTs: 1, newestTs: 2, reachedWindowStart: true },
  complete: false, fetchedAt: "", elapsedMs: 1, source: "polymarket-public" as const,
};

describe("marketModel", () => {
  it("shows the move, the square bar with coverage and the takers", () => {
    const m = marketModel(market, "/market/e");
    expect(m.lead).toContain("Ducks 62% → 86% (+24.0 pts)");
    expect(m.bar).toEqual({ share: 0.39, coverage: 0.6 });
    expect(m.chip!.tone).toBe("bad");
    expect(m.takers).toHaveLength(2);
    expect(m.takers[0]).toMatchObject({ name: "alice", sitePath: "/wallet/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", meta: "$3,900 on Ducks" });
    expect(m.takers[1]!.chip.text).toBe("Still auditing");
    expect(m.refresh).toBe(true);
    expect(m.notes.join(" ")).toContain("not a trade recommendation");
  });
  it("says so when there is no recent move", () => {
    const m = marketModel({ ...market, move: null, noMoveReason: "No recent move: nothing.", squareMoney: null, takers: [], complete: true }, "/market/e");
    expect(m.lead).toContain("No recent move");
    expect(m.takers).toEqual([]);
    expect(m.refresh).toBeUndefined();
  });
});
