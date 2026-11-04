import type { ChipModel, PanelModel, Tone } from "./model";

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: 340px; max-width: calc(100vw - 32px);
  max-height: min(70vh, 560px); display: flex; flex-direction: column;
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e7eaf0;
  background: #11141a; border: 1px solid #232935; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,.45);
}
.head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #232935; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #5eead4; flex: none; }
.brand { font-weight: 600; letter-spacing: .01em; }
.sp { flex: 1; }
button.icon { all: unset; cursor: pointer; padding: 2px 7px; border-radius: 6px; color: #8f98a8; font-size: 15px; line-height: 1; }
button.icon:hover, button.icon:focus-visible { background: #1d222c; color: #e7eaf0; }
.body { padding: 12px; overflow: auto; }
.collapsed .body { display: none; }
.title { color: #8f98a8; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; }
.sub { margin-top: 2px; font-weight: 600; overflow-wrap: anywhere; }
.chip { display: inline-block; margin-top: 8px; padding: 2px 9px; border-radius: 999px; border: 1px solid #232935; font-size: 12px; font-weight: 600; background: #161a22; color: #8f98a8; }
.chip.bad { color: #fb7185; border-color: rgba(251,113,133,.4); background: rgba(251,113,133,.1); }
.chip.warn { color: #fbbf24; border-color: rgba(251,191,36,.4); background: rgba(251,191,36,.1); }
.chip.good { color: #4ade80; border-color: rgba(74,222,128,.4); background: rgba(74,222,128,.1); }
.chip.accent { color: #5eead4; border-color: rgba(94,234,212,.4); background: rgba(94,234,212,.1); }
.lead { margin: 8px 0 0; color: #c3c9d4; }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 10px; }
.stat { background: #161a22; border: 1px solid #232935; border-radius: 8px; padding: 6px 8px; }
.stat b { display: block; font: 600 14px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.stat span { color: #8f98a8; font-size: 11px; }
.bar { display: flex; height: 10px; margin-top: 10px; border-radius: 999px; overflow: hidden; border: 1px solid #232935; background: #161a22; }
.bar i { display: block; height: 100%; }
.bar .sq { background: #fb7185; }
.bar .jd { background: rgba(93,102,118,.7); }
.takers { list-style: none; margin: 10px 0 0; padding: 0; }
.takers li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 0; border-top: 1px solid #232935; }
.takers a { color: #5eead4; text-decoration: none; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.takers a:hover { text-decoration: underline; }
.takers .meta { display: block; color: #5d6676; font-size: 11px; }
.takers .chip { margin: 0; font-size: 11px; white-space: nowrap; }
.note { margin: 8px 0 0; color: #5d6676; font-size: 11px; }
.actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.btn { all: unset; display: inline-block; cursor: pointer; padding: 5px 10px; border-radius: 8px; border: 1px solid #232935; background: #161a22; color: #e7eaf0; font-size: 12px; }
.btn:hover, .btn:focus-visible { border-color: #5eead4; }
.btn.primary { background: #5eead4; color: #0a0c10; border-color: #5eead4; font-weight: 600; }
.err { color: #fb7185; margin: 0; }
.load { color: #8f98a8; margin: 0; }
.pulse { height: 10px; margin-top: 8px; border-radius: 6px; background: #1d222c; animation: p 1.2s ease-in-out infinite; }
@keyframes p { 50% { opacity: .45; } }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
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
        box.append(el("b", undefined, s.value), el("span", undefined, s.label));
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
