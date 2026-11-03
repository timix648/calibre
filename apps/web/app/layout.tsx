import type { Metadata, Viewport } from "next";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CALIBRE: skill, luck, or sniping?", template: "%s | CALIBRE" },
  description:
    "Who moved this market, and is their record skill, luck, or sniping? CALIBRE audits Polymarket wallets with error bars and seals every verdict in Walrus Memory.",
};

export const viewport: Viewport = { themeColor: "#0a0c10", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-30 focus:rounded focus:bg-accent focus:px-3 focus:py-1 focus:text-bg">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="mx-auto max-w-5xl px-4 pb-4 pt-8 sm:px-6 sm:pt-12">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
