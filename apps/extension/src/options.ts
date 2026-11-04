import { DEFAULT_API_BASE, normalizeApiBase } from "./urls";

const input = document.getElementById("api-base") as HTMLInputElement;
const status = document.getElementById("status") as HTMLParagraphElement;
const form = document.getElementById("form") as HTMLFormElement;
const testButton = document.getElementById("test") as HTMLButtonElement;
const reset = document.getElementById("reset") as HTMLButtonElement;

function say(text: string, ok: boolean): void {
  status.textContent = text;
  status.className = ok ? "ok" : "bad";
}

async function load(): Promise<void> {
  const stored = await chrome.storage.sync.get("apiBase");
  input.value = normalizeApiBase(String(stored.apiBase ?? "")) ?? DEFAULT_API_BASE;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const base = normalizeApiBase(input.value);
  if (!base) { say("That is not a web address. Use something like https://your-site.vercel.app", false); return; }
  void chrome.storage.sync.set({ apiBase: base }).then(() => { input.value = base; say(`Saved. The panel will call ${base}.`, true); });
});

testButton.addEventListener("click", () => {
  const base = normalizeApiBase(input.value);
  if (!base) { say("That is not a web address.", false); return; }
  say("Testing…", true);
  // The handle endpoint answers an address with itself, so this checks the site is reachable without calling Polymarket.
  fetch(`${base}/api/xray/handle/0x684baa57c338c2549aec0aa3f034f695d72a8409`, { signal: AbortSignal.timeout(10_000) })
    .then((r) => r.json())
    .then((b: { ok?: boolean }) => say(b.ok ? `Reached ${base}. It answers X-ray requests.` : `${base} answered, but not like a CALIBRE site.`, Boolean(b.ok)))
    .catch(() => say(`Could not reach ${base}. Is the site running?`, false));
});

reset.addEventListener("click", () => {
  input.value = DEFAULT_API_BASE;
  void chrome.storage.sync.set({ apiBase: DEFAULT_API_BASE }).then(() => say(`Reset to ${DEFAULT_API_BASE}.`, true));
});

void load();
