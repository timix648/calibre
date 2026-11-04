import { afterEach, describe, expect, it, vi } from "vitest";
import type { TimedFlowTrade } from "@calibre/core";
import {
  analyseFills, buildMarketXray, marketRefKey, parseMarketRef, parseProfileHandle, pickMainMarket, resolveMarket, resolveProfileHandle,
  shapeMarketXray, toResolvedMarket, toWalletXray, type ResolvedMarket, type TakerAudit, type WalletAuditResult,
} from "../src/index.js";

const COND = "0x159b76fa5382b06fb70bf17593a79a9ee670b7888af945f917de7579138194eb";

describe("parseMarketRef", () => {
  it("reads event and market URLs", () => {
    expect(parseMarketRef("https://polymarket.com/event/nba-phi-det-2026-11-04")).toEqual({ kind: "slug", slug: "nba-phi-det-2026-11-04" });
    expect(parseMarketRef("https://polymarket.com/event/nba-phi-det-2026-11-04/nba-phi-det-2026-11-04-spread-home-4pt5?tid=1#x"))
      .toEqual({ kind: "slug", slug: "nba-phi-det-2026-11-04", marketSlug: "nba-phi-det-2026-11-04-spread-home-4pt5" });
    expect(parseMarketRef("polymarket.com/market/will-it-rain")).toEqual({ kind: "slug", slug: "will-it-rain" });
    expect(parseMarketRef("https://polymarket.com/es/event/some-event")).toEqual({ kind: "slug", slug: "some-event" });
    expect(parseMarketRef("/event/some-event/")).toEqual({ kind: "slug", slug: "some-event" });
  });
  it("reads bare slugs, encoded input and condition ids", () => {
    expect(parseMarketRef("  NBA-PHI-DET-2026-11-04 ")).toEqual({ kind: "slug", slug: "nba-phi-det-2026-11-04" });
    expect(parseMarketRef(encodeURIComponent("https://polymarket.com/event/abc-def"))).toEqual({ kind: "slug", slug: "abc-def" });
    expect(parseMarketRef(COND.toUpperCase().replace("0X", "0x"))).toEqual({ kind: "condition", conditionId: COND });
    expect(parseMarketRef(`https://polymarket.com/market/${COND}`)).toEqual({ kind: "condition", conditionId: COND });
  });
  it("rejects what is not a market", () => {
    for (const bad of ["", "   ", "https://polymarket.com/", "https://polymarket.com/profile/0x684baa57c338c2549aec0aa3f034f695d72a8409", "not a slug!", "0x1234", "0x684baa57c338c2549aec0aa3f034f695d72a8409", "a"]) {
      expect(parseMarketRef(bad), bad).toBeNull();
    }
  });
  it("keys by market when a URL names one", () => {
    expect(marketRefKey({ kind: "slug", slug: "e", marketSlug: "m" })).toBe("e/m");
    expect(marketRefKey({ kind: "slug", slug: "e" })).toBe("e");
  });
});

describe("parseProfileHandle", () => {
  it("reads @username paths", () => {
    expect(parseProfileHandle("https://polymarket.com/@fengdubiying")).toBe("fengdubiying");
    expect(parseProfileHandle("polymarket.com/@Some-Name?tab=x")).toBe("Some-Name");
    expect(parseProfileHandle("@abc")).toBe("abc");
    expect(parseProfileHandle("https://polymarket.com/event/abc")).toBeNull();
  });
});

const market = (slug: string, o: Record<string, unknown> = {}) => ({
  conditionId: `0x${slug.length.toString(16).padStart(64, "0")}`, slug, question: slug, outcomes: '["A","B"]', outcomePrices: '["0.4","0.6"]',
  active: true, closed: false, volumeNum: 100, ...o,
});

describe("pickMainMarket", () => {
  const ev = "nba-phi-det-2026-11-04";
  const markets = [
    market(`${ev}-odd-even`, { outcomes: '["Odd","Even"]', volumeNum: 9000 }),
    market(`${ev}-spread-home-4pt5`, { volumeNum: 5000 }),
    market(ev, { volumeNum: 100 }),
    market(`${ev}-three-way`, { outcomes: '["A","B","C"]' }),
  ];
  it("prefers the market the URL named, then the one with the event's slug", () => {
    expect(pickMainMarket(markets, { eventSlug: ev, marketSlug: `${ev}-spread-home-4pt5` }).slug).toBe(`${ev}-spread-home-4pt5`);
    expect(pickMainMarket(markets, { eventSlug: ev }).slug).toBe(ev);
  });
  it("otherwise takes the biggest live moneyline-like binary market, never a three-way one", () => {
    const m = [market("will-a-win-2026-11-04", { volumeNum: 10 }), market("will-b-win-2026-11-04", { volumeNum: 50 }), market("x-three", { outcomes: '["A","B","C"]', volumeNum: 999 })];
    expect(pickMainMarket(m).slug).toBe("will-b-win-2026-11-04");
    expect(pickMainMarket([market("closed-one", { closed: true, volumeNum: 1e6 }), market("live-one", { volumeNum: 1 })]).slug).toBe("live-one");
    expect(pickMainMarket([market("x", { outcomes: '["A","B","C"]' })])).toBeNull();
    expect(pickMainMarket([])).toBeNull();
  });
});

describe("toResolvedMarket", () => {
  it("reads outcomes and the first outcome's price", () => {
    const r = toResolvedMarket(market("m1", { events: [{ slug: "ev1" }], conditionId: COND.toUpperCase().replace("0X", "0x") }))!;
    expect(r.outcomes).toEqual(["A", "B"]);
    expect(r.yesPrice).toBeCloseTo(0.4);
    expect(r.eventSlug).toBe("ev1");
    expect(r.conditionId).toBe(COND);
    expect(toResolvedMarket({ conditionId: COND, outcomes: '["A","B","C"]' })).toBeNull();
  });
});

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
}

describe("resolveMarket and resolveProfileHandle (Gamma)", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("tries the market slug, then the event's main market", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn((u: string) => {
      urls.push(u);
      if (u.includes("/markets?slug=")) return json([]);
      return json([{ slug: "ev", markets: [market("ev-odd-even", { volumeNum: 5 }), market("ev", { conditionId: COND })] }]);
    }));
    const m = await resolveMarket({ kind: "slug", slug: "ev" });
    expect(m.conditionId).toBe(COND);
    expect(urls[0]).toContain("/markets?slug=ev");
    expect(urls[1]).toContain("/events?slug=ev");
  });

  it("goes straight to a market slug and to a condition id", async () => {
    vi.stubGlobal("fetch", vi.fn((u: string) => (u.includes("condition_ids=") ? json([market("m", { conditionId: COND })]) : json([market("m", { events: [{ slug: "e" }] })]))));
    expect((await resolveMarket({ kind: "slug", slug: "m" })).eventSlug).toBe("e");
    expect((await resolveMarket({ kind: "condition", conditionId: COND })).slug).toBe("m");
  });

  it("answers 404 for an unknown reference", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json([])));
    await expect(resolveMarket({ kind: "slug", slug: "nope" })).rejects.toMatchObject({ status: 404 });
  });

  it("resolves a username only on an exact match", async () => {
    vi.stubGlobal("fetch", vi.fn(() => json({ profiles: [
      { name: "fengdubiying.", proxyWallet: "0x5a0e35d438d39286dea1eb51dd4c7fe3bc84a853" },
      { name: "Fengdubiying", proxyWallet: "0x17db3fcd93ba12d38382a0cade24b200185c5f6d" },
    ] })));
    expect((await resolveProfileHandle("fengdubiying"))?.address).toBe("0x17db3fcd93ba12d38382a0cade24b200185c5f6d");
    expect(await resolveProfileHandle("nobody-here")).toBeNull();
  });
});

// A market whose YES price rises from 0.40 to 0.50 over an hour, pushed by wallets w1..w8 (w1 biggest), with one seller.
const NOW = 1_800_000_000_000;
const fill = (taker: string, minAgo: number, price: number, size: number, o: Partial<TimedFlowTrade> = {}): TimedFlowTrade => ({
  taker, side: "yes", direction: "buy", price, size, ts: NOW - minAgo * 60_000, ...o,
});
const fills: TimedFlowTrade[] = [
  fill("base", 200, 0.4, 10),
  fill("base", 120, 0.4, 10),
  ...Array.from({ length: 8 }, (_, i) => fill(`w${i + 1}`, 60 - i, 0.46 + i * 0.005, 1000 / (i + 1))),
  fill("seller", 20, 0.5, 100, { direction: "sell" }),
  fill("last", 3, 0.5, 10),
];

describe("analyseFills", () => {
  it("finds the latest move and the wallets pushing it, biggest first", () => {
    const a = analyseFills(fills, NOW);
    expect(a.move).not.toBeNull();
    expect(a.move!.from).toBeCloseTo(0.4);
    expect(a.move!.to).toBeCloseTo(0.5);
    expect(a.pushers[0]!.wallet).toBe("w1");
    expect(a.pushers.every((f) => f.netYesUsd > 0)).toBe(true);
    expect(a.pushers.map((f) => f.wallet)).not.toContain("seller");
  });
  it("reports no recent move for a flat or quiet market", () => {
    const flat = [fill("a", 300, 0.5, 10), fill("b", 30, 0.51, 10), fill("c", 3, 0.52, 10)];
    expect(analyseFills(flat, NOW).move).toBeNull();
    expect(analyseFills(flat, NOW).noMoveReason).toContain("No recent move");
    expect(analyseFills([fill("a", 60 * 9, 0.4, 10)], NOW).noMoveReason).toContain("No trades");
  });
  it("does not treat a market settling at 0 or 1 as a move", () => {
    const ending = [fill("a", 120, 0.43, 10), fill("b", 60, 0.2, 10), fill("c", 5, 0.01, 10)];
    const a = analyseFills(ending, NOW);
    expect(a.move).toBeNull();
    expect(a.noMoveReason).toContain("settling");
  });
  it("reads a falling price as a move down, pushed by NO buyers and YES sellers", () => {
    const down = [
      fill("base", 200, 0.6, 10),
      fill("n1", 50, 0.5, 200, { side: "no", direction: "buy" }), // YES at 0.50
      fill("s1", 40, 0.52, 100, { direction: "sell" }),
      fill("up", 30, 0.55, 5),
      fill("last", 5, 0.5, 10),
    ];
    const a = analyseFills(down, NOW);
    expect(a.move!.to).toBeLessThan(a.move!.from);
    expect(a.pushers.map((f) => f.wallet).sort()).toEqual(["n1", "s1"]);
  });
});

const resolved: ResolvedMarket = {
  conditionId: COND, slug: "nba-phi-det-2026-11-04", eventSlug: "nba-phi-det-2026-11-04", question: "76ers vs. Pistons",
  outcomes: ["76ers", "Pistons"], yesPrice: 0.5, closed: false, volume: 1000,
};

function walletResult(address: string, z: number, n: number, snipe = 0): WalletAuditResult {
  const edge = { edge: z * 0.03, se: 0.03, z, n, effN: n, low: 0, high: 0, verdict: "no proven edge (consistent with luck)" as const };
  return {
    address, name: null, tradesFetched: n, truncated: false, firstTradeAt: 1, lastTradeAt: 2, fetchedAt: "2026-11-04T00:00:00Z", source: "polymarket-public",
    audit: {
      n, overall: edge, pregame: edge, inplay: edge, sniping: { markets: 0, resolvedMarkets: 100, share: snipe, edge }, leagues: [],
      verdict: "no proven edge (consistent with luck)", flags: [], trades: n, tradesInResolvedMarkets: n,
    },
  };
}

describe("shapeMarketXray", () => {
  const analysis = analyseFills(fills, NOW);
  const audits = new Map<string, TakerAudit>([
    ["w1", { status: "audited", result: walletResult("w1", -3, 200) }],
    ["w2", { status: "audited", result: walletResult("w2", 0.5, 200) }],
    ["w3", { status: "pending" }],
    ["w4", { status: "failed" }],
  ]);
  const base = { market: resolved, analysis, audits, names: new Map([["w5", "bob"]]), fills: { read: 12, pages: 1, oldestTs: 1, newestTs: 2, reachedWindowStart: true }, startedAt: NOW, now: NOW + 5000 };

  it("returns the move, six takers with labels, and the square-money share with its coverage", () => {
    const r = shapeMarketXray(base);
    expect(r.move).toMatchObject({ direction: "up", settling: false });
    expect(r.move!.points).toBeCloseTo(10);
    expect(r.takers).toHaveLength(6);
    expect(r.takers[0]).toMatchObject({ address: "w1", label: "proven losing record", reliable: true, tone: "bad", status: "audited", pushed: "76ers" });
    expect(r.takers[1]!.label).toBe("no proven edge");
    expect(r.takers[2]).toMatchObject({ label: null, status: "pending", sentence: null });
    expect(r.takers[3]!.status).toBe("failed");
    expect(r.takers[4]!.name).toBe("bob");
    expect(r.squareMoney!.squareWallets).toBe(1);
    expect(r.squareMoney!.share).toBeGreaterThan(0);
    expect(r.squareMoney!.share).toBeLessThan(r.squareMoney!.shareOfJudged!);
    expect(r.squareMoney!.coverage).toBeGreaterThan(0.2);
    expect(r.squareMoney!.coverage).toBeLessThan(1);
    expect(r.squareMoney!.note).toContain("Caution signal. In a replay of 11,975 moves");
    expect(r.complete).toBe(false);
    expect(r.elapsedMs).toBe(5000);
    expect(r.caution).toContain("3.1 pts worse for followers (p = 0.07); early evidence, not conclusive");
    expect(r.market.url).toBe("https://polymarket.com/event/nba-phi-det-2026-11-04");
  });
  it("is complete when every audit finished", () => {
    const all = new Map<string, TakerAudit>(analysis.pushers.slice(0, 6).map((f) => [f.wallet, { status: "audited", result: walletResult(f.wallet, 0, 50) }]));
    const r = shapeMarketXray({ ...base, audits: all });
    expect(r.complete).toBe(true);
    expect(r.squareMoney!.squareWallets).toBe(0);
    expect(r.squareMoney!.coverage).toBeGreaterThan(0);
  });
  it("reports no recent move without takers or a square-money share", () => {
    const r = shapeMarketXray({ ...base, analysis: analyseFills([fill("a", 30, 0.5, 10)], NOW) });
    expect(r.move).toBeNull();
    expect(r.noMoveReason).toContain("No recent move");
    expect(r.takers).toEqual([]);
    expect(r.squareMoney).toBeNull();
    expect(r.complete).toBe(true);
  });
});

describe("toWalletXray", () => {
  it("adds the label, sentence and reliability flag", () => {
    const loser = toWalletXray(walletResult("0xa", -3, 120));
    expect(loser.xray).toMatchObject({ label: "proven losing record", reliable: true, tone: "bad", caveat: null });
    const winner = toWalletXray(walletResult("0xb", 3, 300));
    expect(winner.xray.label).toBe("proven winning record");
    expect(winner.xray.reliable).toBe(false);
    expect(winner.xray.caveat).toContain("+2.2 pts per bet");
  });
});

describe("buildMarketXray", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves, reads fills, audits the pushers and returns partial results at the deadline", async () => {
    const now = Date.now();
    const rows = [
      ...Array.from({ length: 3 }, (_, i) => ({
        proxy_wallet: `0x${"a".repeat(39)}${i}`, side: "BUY", outcome_index: 0, price: 0.5 + i * 0.03, size: 500 - i * 100,
        timestamp: Math.floor((now - (30 - i) * 60_000) / 1000), condition_id: COND, name: i === 0 ? "alice" : undefined,
      })),
      { proxy_wallet: `0x${"b".repeat(40)}`, side: "BUY", outcome_index: 0, price: 0.42, size: 10, timestamp: Math.floor((now - 120 * 60_000) / 1000), condition_id: COND },
    ];
    vi.stubGlobal("fetch", vi.fn((u: string) => {
      if (u.includes("gamma-api") && u.includes("/markets?slug=")) return json([market("m1", { conditionId: COND })]);
      if (u.includes("/v2/trades")) return json({ data: rows, pagination: { has_more: false } });
      return json([]);
    }));
    const slow = `0x${"a".repeat(39)}2`;
    const result = await buildMarketXray({ kind: "slug", slug: "m1" }, {
      budgetMs: 1500,
      audit: (addr) => (addr === slow ? new Promise<never>(() => undefined) : Promise.resolve(walletResult(addr, -3, 100))),
    });
    expect(result.move).not.toBeNull();
    expect(result.takers).toHaveLength(4);
    expect(result.takers.filter((t) => t.label === "proven losing record")).toHaveLength(3);
    expect(result.takers.find((t) => t.address === slow)!.status).toBe("pending");
    expect(result.takers.find((t) => t.name === "alice")).toBeTruthy();
    expect(result.complete).toBe(false);
    expect(result.fills.read).toBe(4);
  }, 10_000);
});
