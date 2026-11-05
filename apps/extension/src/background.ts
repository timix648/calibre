import { DEFAULT_API_BASE, normalizeApiBase } from "./urls";

/** Messages the content script sends to this service worker. */
export interface FetchRequest { type: "calibre:fetch"; path: string }
export interface FetchReply { ok: boolean; status: number; base: string; body: unknown }

async function apiBase(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get("apiBase");
    return normalizeApiBase(String(stored.apiBase ?? "")) ?? DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

/** The content script asks for an API path; the worker fetches it from the configured base (pages on polymarket.com cannot). */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const req = message as Partial<FetchRequest> | { type: "calibre:options" } | null;
  if (req?.type === "calibre:options") { void chrome.runtime.openOptionsPage(); return false; }
  if (req?.type !== "calibre:fetch" || typeof req.path !== "string" || !req.path.startsWith("/api/xray/")) return false;
  const path: string = req.path;
  void (async () => {
    const base = await apiBase();
    try {
      const res = await fetch(`${base}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      const body = await res.json().catch(() => null);
      sendResponse({ ok: res.ok, status: res.status, base, body } satisfies FetchReply);
    } catch (e) {
      sendResponse({ ok: false, status: 0, base, body: { error: e instanceof Error ? e.message : "request failed" } } satisfies FetchReply);
    }
  })();
  return true; // the response is sent asynchronously
});

