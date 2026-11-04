import { describe, expect, it } from "vitest";
import { apiPath, detectPage, normalizeApiBase, sitePath, targetKey } from "../src/urls";

const WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";

describe("detectPage", () => {
  it("detects profile pages by address", () => {
    expect(detectPage(`https://polymarket.com/profile/${WALLET}`)).toEqual({ kind: "wallet", address: WALLET });
    expect(detectPage(`https://polymarket.com/profile/${WALLET.toUpperCase().replace("0X", "0x")}?tab=positions`)).toEqual({ kind: "wallet", address: WALLET });
    expect(detectPage(`https://www.polymarket.com/es/profile/${WALLET}`)).toEqual({ kind: "wallet", address: WALLET });
  });
  it("detects profile pages by username", () => {
    expect(detectPage("https://polymarket.com/@fengdubiying")).toEqual({ kind: "handle", handle: "fengdubiying" });
    expect(detectPage("https://polymarket.com/@Some.Name?tab=activity")).toEqual({ kind: "handle", handle: "Some.Name" });
    expect(detectPage("https://polymarket.com/profile/fengdubiying")).toEqual({ kind: "handle", handle: "fengdubiying" });
    expect(detectPage("https://polymarket.com/@")).toBeNull();
  });
  it("detects event and market pages, with and without a market slug", () => {
    expect(detectPage("https://polymarket.com/event/nba-phi-det-2026-11-04")).toEqual({ kind: "market", slug: "nba-phi-det-2026-11-04" });
    expect(detectPage("https://polymarket.com/event/nba-phi-det-2026-11-04/nba-phi-det-2026-11-04-spread-home-4pt5?tid=1"))
      .toEqual({ kind: "market", slug: "nba-phi-det-2026-11-04", marketSlug: "nba-phi-det-2026-11-04-spread-home-4pt5" });
    expect(detectPage("https://polymarket.com/market/will-it-rain-tomorrow")).toEqual({ kind: "market", slug: "will-it-rain-tomorrow" });
    expect(detectPage("https://polymarket.com/pt-BR/event/some-event/")).toEqual({ kind: "market", slug: "some-event" });
  });
  it("ignores every other page and other sites", () => {
    for (const href of [
      "https://polymarket.com/", "https://polymarket.com/sports", "https://polymarket.com/event", "https://polymarket.com/leaderboard",
      "https://example.com/event/abc-def", "https://polymarket.com.evil.test/event/abc-def", "not a url", "",
    ]) expect(detectPage(href), href).toBeNull();
  });
});

describe("targets", () => {
  it("keys targets so that a changed URL is noticed and an unchanged one is not", () => {
    const a = detectPage("https://polymarket.com/event/abc-def");
    expect(targetKey(a)).toBe(targetKey(detectPage("https://polymarket.com/event/abc-def?x=1")));
    expect(targetKey(a)).not.toBe(targetKey(detectPage("https://polymarket.com/event/abc-def/ghi-jkl")));
    expect(targetKey(null)).toBe("");
  });
  it("builds API and site paths", () => {
    expect(apiPath({ kind: "wallet", address: WALLET })).toBe(`/api/xray/wallet/${WALLET}`);
    expect(apiPath({ kind: "handle", handle: "a b" })).toBe("/api/xray/handle/a%20b");
    expect(apiPath({ kind: "market", slug: "e", marketSlug: "m" })).toBe("/api/xray/market/e?market=m");
    expect(sitePath({ kind: "market", slug: "e" })).toBe("/market/e");
    expect(sitePath({ kind: "wallet", address: WALLET })).toBe(`/wallet/${WALLET}`);
  });
});

describe("normalizeApiBase", () => {
  it("cleans the stored address", () => {
    expect(normalizeApiBase(" http://localhost:3000/ ")).toBe("http://localhost:3000");
    expect(normalizeApiBase("https://calibre.vercel.app///")).toBe("https://calibre.vercel.app");
    expect(normalizeApiBase("calibre.vercel.app")).toBe("https://calibre.vercel.app");
    expect(normalizeApiBase("https://example.com/base/")).toBe("https://example.com/base");
  });
  it("rejects what is not a web address", () => {
    expect(normalizeApiBase("")).toBeNull();
    expect(normalizeApiBase("ftp://x.test")).toBeNull();
    expect(normalizeApiBase("javascript:alert(1)")).toBeNull();
  });
});
