"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SmartInput } from "./smart-input";

const NAV = [
  { href: "/radar", label: "Radar" },
  { href: "/record", label: "Record" },
  { href: "/proof", label: "Proof" },
  { href: "/method", label: "Method" },
  { href: "/#extension", label: "Extension" },
];

export function SiteHeader() {
  const home = usePathname() === "/";
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
        {home ? null : <SmartInput className="w-full sm:ml-auto sm:w-[24rem]" placeholder="Profile, wallet, or market link" />}
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto max-w-5xl px-4 py-8 text-sm leading-relaxed text-muted sm:px-6">
        <p className="font-medium text-fg">CALIBRE: Whale X-ray for prediction markets.</p>
        <p className="mt-2">
          Data: Polymarket public API for live X-rays, Tatum Prediction Markets API and Sui gRPC for the sealed verdicts, Walrus Memory on Sui mainnet for the receipts.
        </p>
        <p className="mt-2 text-xs text-faint">
          Edge is measured against the price paid. It is a record to audit, not advice. Only a proven losing record is a reliable label; square money is a caution signal, not a trade recommendation.
        </p>
      </div>
    </footer>
  );
}
