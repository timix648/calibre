import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = {
  title: "Chrome extension",
  description: "The CALIBRE Whale X-ray as a panel on polymarket.com profiles, markets and game pages.",
};

const REPO = "https://github.com/timix648/calibre/tree/main/apps/extension";
// A real screenshot of the panel on polymarket.com, when one has been added to apps/web/public.
const SHOT = existsSync(path.join(process.cwd(), "public", "extension-panel.png")) ? "/extension-panel.png" : null;

const code = "num rounded border border-line bg-panel-2 px-1.5 py-0.5 text-xs text-fg";

const PAGES = [
  { where: "A profile", url: "polymarket.com/profile/0x…  or  polymarket.com/@name", shows: "The wallet's label, its edge per bet with an error band, how many bets were scored and its sniping share." },
  { where: "A market or event", url: "polymarket.com/event/…", shows: "The latest move of 4 points or more, how much of the money behind it came from proven losers, and the biggest takers with their labels." },
  { where: "A game", url: "polymarket.com/sports/<league>/…  and  /esports/…", shows: "The same market X-ray for the match." },
];

export default function ExtensionPage() {
  return (
    <div className="space-y-12">
      <PageTitle
        title="Chrome extension"
        sub="The X-ray as a small panel on polymarket.com, so you see who is behind a move or a wallet without leaving the page."
      />

      <section className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <a href="/calibre-extension.zip" download className="rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-bg transition hover:brightness-110 active:translate-y-px">
              Download for Chrome
            </a>
            <span className="num text-xs text-faint">calibre-extension.zip · v0.1.0 · 11 KB</span>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Works in Chrome, Edge, Brave and other Chromium browsers. It is not in the Chrome Web Store yet, so it installs as an unpacked extension.
          </p>

          <h2 className="mt-10 text-lg font-semibold tracking-tight">Install in about a minute</h2>
          <ol className="mt-4 space-y-4 text-sm leading-relaxed text-muted">
            <li className="grid grid-cols-[1.5rem_1fr] gap-3"><span className="num text-accent">1</span><span><strong className="font-medium text-fg">Unzip</strong> the download into a folder you will keep. Chrome loads it from there, so do not delete the folder afterwards.</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-3"><span className="num text-accent">2</span><span>Open <code className={code}>chrome://extensions</code> (Edge: <code className={code}>edge://extensions</code>, Brave: <code className={code}>brave://extensions</code>) and turn on <strong className="font-medium text-fg">Developer mode</strong>, top right.</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-3"><span className="num text-accent">3</span><span>Click <strong className="font-medium text-fg">Load unpacked</strong> and pick the folder you unzipped (the one that holds <code className={code}>manifest.json</code>).</span></li>
            <li className="grid grid-cols-[1.5rem_1fr] gap-3"><span className="num text-accent">4</span><span>Open any Polymarket profile or market. The panel appears at the bottom right; collapse it with the dash, close it with the cross.</span></li>
          </ol>
        </div>

        <aside className="self-start rounded-2xl border border-line bg-panel p-5 text-sm leading-relaxed text-muted">
          <h2 className="font-semibold text-fg">What it can see</h2>
          <ul className="mt-3 space-y-2">
            <li>Runs only on polymarket.com, and asks for one permission: storage, for its settings.</li>
            <li>Reads only the page address. It never reads the page content or your Polymarket session.</li>
            <li>Sends the wallet, username or market slug from that address to this site, and nothing else.</li>
          </ul>
          <p className="mt-4">
            The source is in the repository: <a className="text-accent underline decoration-accent/40" href={REPO} target="_blank" rel="noreferrer">apps/extension</a>.
          </p>
        </aside>
      </section>

      {SHOT ? (
        <figure className="overflow-hidden rounded-2xl border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={SHOT} alt="The CALIBRE panel on a Polymarket page, showing a wallet's label and record" className="w-full" />
          <figcaption className="border-t border-line px-5 py-3 text-xs text-faint">The panel on a live Polymarket page.</figcaption>
        </figure>
      ) : null}

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Where it shows up</h2>
        <dl className="mt-4 divide-y divide-line border-y border-line">
          {PAGES.map((p) => (
            <div key={p.where} className="grid gap-1 py-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-10">
              <dt>
                <div className="font-medium text-fg">{p.where}</div>
                <div className="num mt-0.5 text-xs text-faint">{p.url}</div>
              </dt>
              <dd className="text-sm leading-relaxed text-muted">{p.shows}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">If the panel does not appear</h2>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
            <li>Reload the Polymarket tab once after installing.</li>
            <li>Open the extension&apos;s options (Details, then Extension options) and press <strong className="font-medium text-fg">Test</strong>: it checks that this site answers.</li>
            <li>A wallet audit reads up to 1,000 trades and can take a few seconds the first time.</li>
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Updating</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Download the zip again, unzip it over the same folder, then press the reload arrow on the extension&apos;s card in{" "}
            <code className={code}>chrome://extensions</code>.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Prefer the website? Paste any profile, wallet or market link on the <Link href="/" className="text-accent underline decoration-accent/40">home page</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
