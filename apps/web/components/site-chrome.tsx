import Link from "next/link";
import { SearchBox } from "./search-box";

const NAV = [
  { href: "/moves", label: "Moves" },
  { href: "/proof", label: "Proof" },
  { href: "/method", label: "Method" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
          CALIBRE
        </Link>
        <nav aria-label="Main" className="flex items-center gap-5 text-sm text-muted">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-fg">{n.label}</Link>
          ))}
        </nav>
        <SearchBox className="w-full sm:ml-auto sm:w-[22rem]" />
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm leading-relaxed text-muted sm:px-6">
        <p>Data: Tatum Prediction Markets API, Polymarket public API (fallback and history), Walrus Memory on Sui mainnet.</p>
        <p className="mt-2 text-xs text-faint">
          Edge is measured against the price paid. It is a record to audit, not advice, and a past record does not predict a future one.
        </p>
      </div>
    </footer>
  );
}
