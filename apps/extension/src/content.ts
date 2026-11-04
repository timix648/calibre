import type { FetchReply } from "./background";
import { marketModel, walletModel } from "./model";
import { Panel } from "./panel";
import { apiPath, detectPage, sitePath, targetKey, type PageTarget } from "./urls";

type MarketXray = Parameters<typeof marketModel>[0];
type WalletXray = Parameters<typeof walletModel>[0];

const panel = new Panel();
let currentKey = "";
/** Bumped on every navigation and every request, so a slow answer for an old page is dropped. */
let generation = 0;
let apiBase = "";

async function call(path: string): Promise<FetchReply> {
  const reply = (await chrome.runtime.sendMessage({ type: "calibre:fetch", path })) as FetchReply | undefined;
  if (!reply) return { ok: false, status: 0, base: apiBase, body: { error: "The CALIBRE extension did not answer." } };
  apiBase = reply.base;
  return reply;
}

const errorText = (r: FetchReply): string => {
  const body = r.body as { error?: string } | null;
  if (r.status === 0) return `Could not reach the CALIBRE API at ${r.base}. Check the API address in the extension's options, and that the site is running.`;
  return body?.error ?? `The CALIBRE API answered ${r.status}.`;
};

const siteUrl = (path: string): string => `${apiBase || "http://localhost:3000"}${path}`;

async function load(target: PageTarget, gen: number): Promise<void> {
  const retry = () => { if (gen === generation) void run(target); };
  try {
    let wallet: { address: string } | null = target.kind === "wallet" ? target : null;
    if (target.kind === "handle") {
      panel.loading(`Looking up @${target.handle}`);
      const found = await call(apiPath(target));
      if (gen !== generation) return;
      const body = found.body as { ok?: boolean; address?: string; error?: string } | null;
      if (!found.ok || !body?.address) {
        panel.error(found.status === 404 || body?.error ? body?.error ?? "Profile not found." : errorText(found), found.status === 404 ? undefined : retry);
        return;
      }
      wallet = { address: body.address };
    }
    if (wallet) {
      panel.loading("Reading this wallet's trades and results. A few seconds.");
      const res = await call(apiPath({ kind: "wallet", address: wallet.address }));
      if (gen !== generation) return;
      const body = res.body as { ok?: boolean; result?: WalletXray; error?: string } | null;
      if (!res.ok || !body?.result) { panel.error(errorText(res), retry); return; }
      panel.show(walletModel(body.result), { onRefresh: retry, siteUrl });
      return;
    }
    panel.loading("Reading the market's recent fills and auditing the biggest takers. Up to 25 seconds.");
    const res = await call(apiPath(target));
    if (gen !== generation) return;
    const body = res.body as { ok?: boolean; result?: MarketXray; error?: string } | null;
    if (!res.ok || !body?.result) { panel.error(errorText(res), res.status === 404 || res.status === 400 ? undefined : retry); return; }
    panel.show(marketModel(body.result, sitePath(target)), { onRefresh: retry, siteUrl });
  } catch (e) {
    if (gen === generation) panel.error(e instanceof Error ? e.message : "Something went wrong.", retry);
  }
}

async function run(target: PageTarget): Promise<void> {
  const gen = ++generation;
  await load(target, gen);
}

/** Looks at the current URL and shows, replaces or removes the panel. Called on every navigation. */
function check(): void {
  const target = detectPage(location.href);
  const key = targetKey(target);
  if (key === currentKey) return;
  currentKey = key;
  generation++;
  panel.reset();
  if (!target) { panel.unmount(); return; }
  void run(target);
}

// Polymarket is a single-page app: the URL changes without a page load. The content script runs in an isolated world and cannot
// see the page's history calls, so it listens for the events that do reach it and also polls the URL, which is cheap and robust.
window.addEventListener("popstate", check);
window.addEventListener("hashchange", check);
(window as unknown as { navigation?: EventTarget }).navigation?.addEventListener("navigatesuccess", check);
setInterval(check, 600);
check();
