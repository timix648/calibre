import { describe, expect, it } from "vitest";
import { CORS_HEADERS, apiError, apiOk, preflight } from "../lib/api";
import { refFromRequest, runHandleLookup, runMarketXray } from "../lib/xray-service";

describe("refFromRequest", () => {
  it("reads the path segment and an optional market query", () => {
    expect(refFromRequest("nba-phi-det-2026-11-04")).toEqual({ kind: "slug", slug: "nba-phi-det-2026-11-04" });
    expect(refFromRequest("nba-phi-det-2026-11-04", "nba-phi-det-2026-11-04-spread-home-4pt5"))
      .toEqual({ kind: "slug", slug: "nba-phi-det-2026-11-04", marketSlug: "nba-phi-det-2026-11-04-spread-home-4pt5" });
    expect(refFromRequest(encodeURIComponent("https://polymarket.com/event/a-b/c-d"), "ignored")).toEqual({ kind: "slug", slug: "a-b", marketSlug: "c-d" });
  });
  it("is null for something that is not a market", () => {
    expect(refFromRequest("0x684baa57c338c2549aec0aa3f034f695d72a8409")).toBeNull();
    expect(refFromRequest("not a slug!")).toBeNull();
  });
});

describe("runMarketXray and runHandleLookup", () => {
  it("answers 400 for a bad reference and a bad username without calling Polymarket", async () => {
    const r = await runMarketXray(null, "ip-1");
    expect(r).toMatchObject({ ok: false, status: 400, code: "bad_ref" });
    expect(await runHandleLookup("not a handle!", "ip-1")).toMatchObject({ ok: false, status: 400, code: "bad_handle" });
  });
  it("hands an address back as itself", async () => {
    expect(await runHandleLookup("0x684BAA57c338c2549aec0aa3f034f695d72a8409", "ip-1")).toMatchObject({ ok: true, address: "0x684baa57c338c2549aec0aa3f034f695d72a8409" });
  });
});

describe("api helpers", () => {
  it("send CORS headers on success, error and preflight", async () => {
    for (const res of [apiOk({ x: 1 }), apiError(429, "rate_limited", "slow down", 12), preflight()]) {
      expect(res.headers.get("access-control-allow-origin")).toBe(CORS_HEADERS["Access-Control-Allow-Origin"]);
    }
    expect(apiError(429, "rate_limited", "slow", 12).headers.get("retry-after")).toBe("12");
    expect(preflight().status).toBe(204);
    const ok = apiOk({ result: 1 }, 600);
    expect(ok.headers.get("cache-control")).toContain("s-maxage=600");
    expect(await ok.json()).toEqual({ ok: true, result: 1 });
  });
});
