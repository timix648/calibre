import type { ChipModel, PanelModel, Tone } from "./model";

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-width: calc(100vw - 32px);
  max-height: min(70vh, 560px); display: flex; flex-direction: column;
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e7eaf0;
  background:
    linear-gradient(#5eead4, #5eead4) top right / 18px 1px, linear-gradient(#5eead4, #5eead4) top right / 1px 18px,
    linear-gradient(#3a4352, #3a4352) bottom left / 18px 1px, linear-gradient(#3a4352, #3a4352) bottom left / 1px 18px,
    radial-gradient(420px 220px at 0% 0%, rgba(94,234,212,.09), transparent 70%), #090b0f;
  background-repeat: no-repeat;
  border: 1px solid #1d232e;
  clip-path: polygon(16px 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%, 0 16px);
  animation: cal-in .55s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes cal-in { from { opacity: 0; transform: translateX(40px); } to { opacity: 1; transform: none; } }
.body > * { animation: cal-rise .5s cubic-bezier(.2,.8,.2,1) both; }
.body > *:nth-child(2) { animation-delay: 50ms; } .body > *:nth-child(3) { animation-delay: 100ms; }
.body > *:nth-child(4) { animation-delay: 150ms; } .body > *:nth-child(5) { animation-delay: 200ms; }
.body > *:nth-child(6) { animation-delay: 250ms; } .body > *:nth-child(n+7) { animation-delay: 300ms; }
@keyframes cal-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px 10px 18px; border-bottom: 1px solid #1d232e; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #5eead4; flex: none; box-shadow: 0 0 0 0 rgba(94,234,212,.6); animation: cal-ping 2.4s ease-out infinite; }
@keyframes cal-ping { 0% { box-shadow: 0 0 0 0 rgba(94,234,212,.55); } 70%, 100% { box-shadow: 0 0 0 7px rgba(94,234,212,0); } }
.brand { font-weight: 700; letter-spacing: .14em; font-size: 12px; }
.sp { flex: 1; }
button.icon { all: unset; cursor: pointer; padding: 2px 7px; border-radius: 6px; color: #8f98a8; font-size: 15px; line-height: 1; }
button.icon:hover, button.icon:focus-visible { background: #1d222c; color: #e7eaf0; }
.body { padding: 14px 16px 16px; overflow: auto; }
.collapsed .body { display: none; }
.title { color: #8f98a8; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.sub { margin-top: 2px; font-weight: 600; overflow-wrap: anywhere; }
.chip { display: inline-block; margin-top: 8px; padding: 2px 10px; font-size: 12px; font-weight: 600; background: rgba(255,255,255,.05); color: #8f98a8;
  clip-path: polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px); }
.chip.bad { color: #e5484d; background: rgba(229,72,77,.1); }
.chip.warn { color: #fbbf24; background: rgba(251,191,36,.1); }
.chip.good { color: #4ade80; background: rgba(74,222,128,.1); }
.chip.accent { color: #5eead4; background: rgba(94,234,212,.1); }
.lead { margin: 8px 0 0; color: #c3c9d4; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 14px; }
.stat { position: relative; padding-top: 8px; border-top: 1px solid #1d232e; }
.stat::before { content: ""; position: absolute; left: 0; top: -1px; height: 1px; width: 18px; background: #5eead4; }
.stat b { display: block; font: 600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.stat span { color: #8f98a8; font-size: 11px; }
.bar { display: flex; height: 8px; margin-top: 12px; overflow: hidden; background: #12161d;
  clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%); }
.bar i { display: block; height: 100%; transform-origin: left; animation: cal-grow 1s cubic-bezier(.2,.8,.2,1) .2s both; }
@keyframes cal-grow { from { transform: scaleX(0); } to { transform: none; } }
.bar .sq { background: #e5484d; }
.bar .jd { background: rgba(93,102,118,.7); }
.takers { list-style: none; margin: 10px 0 0; padding: 0; }
.takers li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-top: 1px solid #232935; }
.takers a { color: #5eead4; text-decoration: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.takers a:hover { text-decoration: underline; }
.takers .meta { display: block; color: #5d6676; font-size: 11px; }
.takers .chip { margin: 0; font-size: 11px; white-space: nowrap; }
.note { margin: 8px 0 0; color: #5d6676; font-size: 11px; }
.actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.btn { all: unset; display: inline-block; cursor: pointer; padding: 6px 12px; background: #12161d; color: #e7eaf0; font-size: 12px; transition: background .2s, transform .1s;
  clip-path: polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px); }
.btn:active { transform: translateY(1px); }
.btn:hover, .btn:focus-visible { background: #1b2029; }
.btn.primary { background: #5eead4; color: #06070a; font-weight: 600; }
.btn.primary:hover { background: #7ff0dd; }
.err { color: #e5484d; margin: 0; }
.load { color: #8f98a8; margin: 0; }
.pulse { height: 10px; margin-top: 8px; border-radius: 6px; background: #1d222c; animation: p 1.2s ease-in-out infinite; }
@keyframes p { 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .wrap, .body > *, .bar i, .dot { animation: none !important; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Counts the numbers in a stat ("383", "+0.6 ± 4.6", "72%") up from zero, keeping their format. */
function countUp(node: HTMLElement, text: string): void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const parts = text.split(/(d[d,]*(?:.d+)?)/);
  if (parts.length < 2) return;
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / 900);
    const k = 1 - Math.pow(1 - t, 4);
    node.textContent = parts.map((p, i) => {
      if (i % 2 === 0) return p;
      const n = Number(p.replace(/,/g, ""));
      const d = p.includes(".") ? p.split(".")[1]!.length : 0;
      return (n * k).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: p.includes(",") });
    }).join("");
    if (t < 1) raf = requestAnimationFrame(step);
  };
  let raf = requestAnimationFrame(step);
  // Always land on the real value, even if the page pauses animation frames.
  setTimeout(() => { cancelAnimationFrame(raf); node.textContent = text; }, 1300);
}

const chipEl = (c: ChipModel): HTMLSpanElement => el("span", `chip ${c.tone satisfies Tone}`, c.text);

export interface PanelHandlers {
  onRefresh: () => void;
  /** Absolute URL of a CALIBRE site path, given the API base currently in use. */
  siteUrl: (sitePath: string) => string;
}

/** A floating panel in a closed shadow root, so Polymarket's styles cannot reach it and it cannot reach them. */
export class Panel {
  private readonly host: HTMLElement;
  private readonly wrap: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private handlers: PanelHandlers | null = null;

  constructor() {
    this.host = el("div");
    this.host.id = "calibre-xray-host";
    const root = this.host.attachShadow({ mode: "closed" });
    const style = el("style");
    style.textContent = CSS;
    this.wrap = el("div", "wrap");
    this.wrap.setAttribute("role", "complementary");
    this.wrap.setAttribute("aria-label", "CALIBRE Whale X-ray");
    const head = el("div", "head");
    head.append(el("span", "dot"), el("span", "brand", "CALIBRE"), el("span", "sp"));
    const collapse = el("button", "icon", "–");
    collapse.title = "Collapse";
    collapse.setAttribute("aria-label", "Collapse or expand the panel");
    collapse.addEventListener("click", () => this.wrap.classList.toggle("collapsed"));
    const close = el("button", "icon", "×");
    close.title = "Close";
    close.setAttribute("aria-label", "Close the panel");
    close.addEventListener("click", () => this.hide());
    head.append(collapse, close);
    this.body = el("div", "body");
    this.wrap.append(head, this.body);
    root.append(style, this.wrap);
  }

  /** Whether the user closed the panel (it stays closed on this page until the URL changes). */
  closed = false;

  mount(): void {
    if (!this.host.isConnected && !this.closed) document.documentElement.append(this.host);
  }

  hide(): void {
    this.closed = true;
    this.host.remove();
  }

  reset(): void {
    this.closed = false;
  }

  unmount(): void {
    this.host.remove();
  }

  loading(what: string): void {
    this.mount();
    this.body.replaceChildren(el("p", "load", what), el("div", "pulse"), el("div", "pulse"));
  }

  error(message: string, retry?: () => void): void {
    this.mount();
    const actions = el("div", "actions");
    if (retry) {
      const b = el("button", "btn", "Try again");
      b.addEventListener("click", retry);
      actions.append(b);
    }
    const opts = el("button", "btn", "API settings");
    opts.addEventListener("click", () => { void chrome.runtime.sendMessage({ type: "calibre:options" }); });
    actions.append(opts);
    this.body.replaceChildren(el("p", "err", message), actions);
  }

  show(model: PanelModel, handlers: PanelHandlers): void {
    this.handlers = handlers;
    this.mount();
    const out: HTMLElement[] = [el("div", "title", model.title)];
    if (model.subtitle) out.push(el("div", "sub", model.subtitle));
    if (model.chip) out.push(chipEl(model.chip));
    if (model.lead) out.push(el("p", "lead", model.lead));
    if (model.bar) {
      const bar = el("div", "bar");
      bar.setAttribute("role", "img");
      bar.setAttribute("aria-label", `${Math.round(model.bar.share * 100)}% of the pushing money from proven losers; ${Math.round(model.bar.coverage * 100)}% judged`);
      const sq = el("i", "sq");
      sq.style.width = `${Math.min(100, model.bar.share * 100)}%`;
      const jd = el("i", "jd");
      jd.style.width = `${Math.max(0, Math.min(100, (model.bar.coverage - model.bar.share) * 100))}%`;
      bar.append(sq, jd);
      out.push(bar);
    }
    if (model.stats.length > 0) {
      const stats = el("div", "stats");
      for (const s of model.stats) {
        const box = el("div", "stat");
        const value = el("b", undefined, s.value);
        countUp(value, s.value);
        box.append(value, el("span", undefined, s.label));
        stats.append(box);
      }
      out.push(stats);
    }
    if (model.takers.length > 0) {
      const list = el("ul", "takers");
      for (const t of model.takers) {
        const li = el("li");
        const left = el("div");
        const a = el("a", undefined, t.name);
        a.href = this.handlers.siteUrl(t.sitePath);
        a.target = "_blank";
        a.rel = "noreferrer noopener";
        left.append(a, el("span", "meta", t.meta));
        li.append(left, chipEl(t.chip));
        list.append(li);
      }
      out.push(list);
    }
    for (const n of model.notes) out.push(el("p", "note", n));
    const actions = el("div", "actions");
    if (model.more) {
      const a = el("a", "btn primary", model.more.label);
      a.href = this.handlers.siteUrl(model.more.sitePath);
      a.target = "_blank";
      a.rel = "noreferrer noopener";
      actions.append(a);
    }
    if (model.refresh) {
      const b = el("button", "btn", "Check again");
      b.addEventListener("click", () => this.handlers?.onRefresh());
      actions.append(b);
    }
    if (actions.childElementCount > 0) out.push(actions);
    this.body.replaceChildren(...out);
  }
}
