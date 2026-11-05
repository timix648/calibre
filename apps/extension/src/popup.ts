import { DEFAULT_API_BASE, detectPage, normalizeApiBase, sitePath } from "./urls";

/** What the content script on the active tab reports (absent when the tab is not polymarket.com). */
export interface PageStatus { type: "calibre:status"; kind: "wallet" | "handle" | "market" | null; visible: boolean }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

async function apiBase(): Promise<string> {
  try {
    const stored = await chrome.storage.sync.get("apiBase");
    return normalizeApiBase(String(stored.apiBase ?? "")) ?? DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = `btn ${cls}`;
  b.textContent = text;
  b.addEventListener("click", onClick);
  return b;
}

function setState(title: string, text: string, actions: HTMLButtonElement[] = []): void {
  $("state-title").textContent = title;
  $("state-text").textContent = text;
  $("state-actions").replaceChildren(...actions);
}

const open = (url: string) => { void chrome.tabs.create({ url }); window.close(); };

async function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Asks the content script on the active tab what it is showing. It only runs on polymarket.com, so no answer means another site. */
async function status(tabId: number): Promise<PageStatus | null> {
  try {
    return (await chrome.tabs.sendMessage(tabId, { type: "calibre:status" })) as PageStatus;
  } catch {
    return null;
  }
}

const WHAT: Record<string, string> = { wallet: "this wallet", handle: "this profile", market: "this market" };

async function showTabState(): Promise<void> {
  const tab = await activeTab();
  const st = tab?.id !== undefined ? await status(tab.id) : null;
  if (!st) {
    setState("Not a Polymarket page", "Open a Polymarket profile, market or game, and the X-ray panel appears at the bottom right.", [
      button("Go to Polymarket", "primary", () => open("https://polymarket.com/sports/live")),
    ]);
    return;
  }
  if (!st.kind) {
    setState("On Polymarket", "Open a profile, market or game page to see who is behind it.");
    return;
  }
  if (st.visible) {
    setState(`X-raying ${WHAT[st.kind]}`, "The panel is open at the bottom right of the page.");
    return;
  }
  setState(`Ready for ${WHAT[st.kind]}`, "The panel is closed on this page.", [
    button("Show the panel", "primary", () => {
      if (tab?.id === undefined) return;
      void chrome.tabs.sendMessage(tab.id, { type: "calibre:show" }).then(() => window.close(), () => undefined);
    }),
  ]);
}

/** Turns what was pasted into a CALIBRE page: a wallet, a market, or a profile handle looked up through the site. */
async function lookup(raw: string): Promise<void> {
  const q = raw.trim();
  const base = await apiBase();
  const err = $("err");
  err.textContent = "";
  if (!q) return;
  if (ADDRESS.test(q)) { open(`${base}/wallet/${q.toLowerCase()}`); return; }
  const handleOnly = /^@?([A-Za-z0-9_.-]{1,60})$/.exec(q);
  const target = detectPage(/^https?:\/\//.test(q) ? q : `https://polymarket.com/${q.replace(/^\/+/, "")}`);
  if (target && target.kind !== "handle") { open(`${base}${sitePath(target)}`); return; }
  const handle = target?.kind === "handle" ? target.handle : q.startsWith("@") && handleOnly ? handleOnly[1]! : null;
  if (!handle) { err.textContent = "Paste a Polymarket profile, @handle, wallet address or market link."; return; }
  err.textContent = "Looking up the profile…";
  try {
    const res = await fetch(`${base}/api/xray/handle/${encodeURIComponent(handle)}`, { signal: AbortSignal.timeout(15_000) });
    const body = (await res.json()) as { ok?: boolean; address?: string; error?: string };
    if (body.ok && body.address) open(`${base}/wallet/${body.address}`);
    else err.textContent = body.error ?? "Profile not found.";
  } catch {
    err.textContent = `Could not reach ${base}.`;
  }
}

$("lookup").addEventListener("submit", (e) => { e.preventDefault(); void lookup(($("q") as HTMLInputElement).value); });
$("site").addEventListener("click", (e) => { e.preventDefault(); void apiBase().then(open); });
$("settings").addEventListener("click", (e) => { e.preventDefault(); void chrome.runtime.openOptionsPage(); window.close(); });
void showTabState();
