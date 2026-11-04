import { isAddress, parseMarketRef, parseProfileHandle } from "@calibre/public-data";

export type RoutedInput =
  | { kind: "href"; href: string }
  /** A Polymarket @username: it has to be looked up before it can be routed. */
  | { kind: "handle"; handle: string }
  | { kind: "error"; message: string };

const ADDRESS = /0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/;

/**
 * Decides where a pasted value goes: a wallet address or profile URL to the wallet X-ray, a market or event URL, slug or
 * condition id to the market X-ray, an @username to a lookup.
 */
export function routeInput(input: string): RoutedInput {
  const text = input.trim();
  if (!text) return { kind: "error", message: "Paste a Polymarket profile link, wallet address, or market link." };

  // A 64-digit condition id contains a 40-digit prefix, so test for a condition id first.
  const market = parseMarketRef(text);
  if (market?.kind === "condition") return { kind: "href", href: `/market/${market.conditionId}` };

  const address = ADDRESS.exec(text)?.[0];
  if (address && isAddress(address)) return { kind: "href", href: `/wallet/${address.toLowerCase()}` };

  const handle = parseProfileHandle(text);
  if (handle) return { kind: "handle", handle };

  if (market?.kind === "slug") {
    const query = market.marketSlug ? `?market=${encodeURIComponent(market.marketSlug)}` : "";
    return { kind: "href", href: `/market/${encodeURIComponent(market.slug)}${query}` };
  }
  return { kind: "error", message: "That is not a Polymarket profile link, wallet address, or market link." };
}
