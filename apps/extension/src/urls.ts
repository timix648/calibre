/** What a polymarket.com URL is about, as far as CALIBRE can X-ray it. */
export type PageTarget =
  | { kind: "wallet"; address: string }
  /** A profile given by username (`/@name`, or `/profile/<name>`): the address has to be looked up first. */
  | { kind: "handle"; handle: string }
  | { kind: "market"; slug: string; marketSlug?: string };

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{1,200}$/;
const HANDLE = /^[A-Za-z0-9_.-]{1,60}$/;

/**
 * Detects a profile page (`/profile/0x…`, `/@username`) or an event or market page (`/event/<slug>[/<market-slug>]`,
 * `/market/<slug>`) in a Polymarket URL. A locale prefix such as `/es/` is allowed. Null for every other page.
 */
export function detectPage(href: string): PageTarget | null {
  let url: URL;
  try { url = new URL(href); } catch { return null; }
  if (url.hostname !== "polymarket.com" && !url.hostname.endsWith(".polymarket.com")) return null;
  const parts = url.pathname.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  // Skip one locale segment ("es", "pt-BR") before the section name.
  const start = parts.length > 1 && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(parts[0]!) ? 1 : 0;
  const head = parts[start];
  const next = parts[start + 1];
  if (!head) return null;

  if (head.startsWith("@")) {
    const handle = head.slice(1);
    return HANDLE.test(handle) ? { kind: "handle", handle } : null;
  }
  if (head === "profile" && next) {
    if (ADDRESS.test(next)) return { kind: "wallet", address: next.toLowerCase() };
    const handle = next.replace(/^@/, "");
    return HANDLE.test(handle) ? { kind: "handle", handle } : null;
  }
  if ((head === "event" || head === "market") && next) {
    const slug = next.toLowerCase();
    if (!SLUG.test(slug)) return null;
    const market = head === "event" ? parts[start + 2]?.toLowerCase() : undefined;
    return market && SLUG.test(market) ? { kind: "market", slug, marketSlug: market } : { kind: "market", slug };
  }
  return null;
}

/** A stable key for a target, used to notice that the page changed. */
export function targetKey(t: PageTarget | null): string {
  if (!t) return "";
  return t.kind === "wallet" ? `w:${t.address}` : t.kind === "handle" ? `h:${t.handle.toLowerCase()}` : `m:${t.slug}/${t.marketSlug ?? ""}`;
}

export const DEFAULT_API_BASE = "https://calibre-blush.vercel.app";

/** The API base as stored: trimmed, no trailing slash, http or https only. Null when it is not a usable URL. */
export function normalizeApiBase(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  try {
    // A bare host gets https; anything that names another scheme ("ftp://", "javascript:") is refused.
    const hasScheme = /^[a-z][a-z0-9+.-]*:(\/\/|[^\d])/i.test(text);
    const url = new URL(hasScheme ? text : `https://${text}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** The API path for a target (the handle lookup is a separate call). */
export function apiPath(t: PageTarget): string {
  if (t.kind === "wallet") return `/api/xray/wallet/${t.address}`;
  if (t.kind === "handle") return `/api/xray/handle/${encodeURIComponent(t.handle)}`;
  return `/api/xray/market/${encodeURIComponent(t.slug)}${t.marketSlug ? `?market=${encodeURIComponent(t.marketSlug)}` : ""}`;
}

/** The page of the CALIBRE site that shows the same X-ray in full. */
export function sitePath(t: PageTarget | { kind: "wallet"; address: string }): string {
  if (t.kind === "wallet") return `/wallet/${t.address}`;
  if (t.kind === "handle") return "/";
  return `/market/${encodeURIComponent(t.slug)}${t.marketSlug ? `?market=${encodeURIComponent(t.marketSlug)}` : ""}`;
}
