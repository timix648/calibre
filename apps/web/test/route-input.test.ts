import { describe, expect, it } from "vitest";
import { routeInput } from "../lib/route-input";

const WALLET = "0x684baa57c338c2549aec0aa3f034f695d72a8409";
const COND = "0x159b76fa5382b06fb70bf17593a79a9ee670b7888af945f917de7579138194eb";

describe("routeInput", () => {
  it("sends a wallet address or a profile link to the wallet X-ray", () => {
    expect(routeInput(WALLET)).toEqual({ kind: "href", href: `/wallet/${WALLET}` });
    expect(routeInput(` ${WALLET.toUpperCase().replace("0X", "0x")} `)).toEqual({ kind: "href", href: `/wallet/${WALLET}` });
    expect(routeInput(`https://polymarket.com/profile/${WALLET}?tab=activity`)).toEqual({ kind: "href", href: `/wallet/${WALLET}` });
  });
  it("sends event and market links, slugs and condition ids to the market X-ray", () => {
    expect(routeInput("https://polymarket.com/event/nba-phi-det-2026-11-04")).toEqual({ kind: "href", href: "/market/nba-phi-det-2026-11-04" });
    expect(routeInput("https://polymarket.com/event/nba-phi-det-2026-11-04/nba-phi-det-2026-11-04-spread-home-4pt5"))
      .toEqual({ kind: "href", href: "/market/nba-phi-det-2026-11-04?market=nba-phi-det-2026-11-04-spread-home-4pt5" });
    expect(routeInput("nba-phi-det-2026-11-04")).toEqual({ kind: "href", href: "/market/nba-phi-det-2026-11-04" });
    expect(routeInput(COND)).toEqual({ kind: "href", href: `/market/${COND}` });
  });
  it("asks for a lookup on an @username", () => {
    expect(routeInput("https://polymarket.com/@fengdubiying")).toEqual({ kind: "handle", handle: "fengdubiying" });
    expect(routeInput("@some-name")).toEqual({ kind: "handle", handle: "some-name" });
  });
  it("explains what it could not read", () => {
    expect(routeInput("").kind).toBe("error");
    expect(routeInput("hello world!").kind).toBe("error");
    expect(routeInput("0x1234").kind).toBe("error");
  });
});
