"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export type FailureCode = "bad_ref" | "bad_address" | "not_found" | "rate_limited" | "upstream" | "network" | "unknown";

const COPY: Record<FailureCode, { title: string; hint: ReactNode }> = {
  bad_ref: {
    title: "That does not look like a Polymarket market",
    hint: <>Paste a <span className="num">polymarket.com/event/…</span> link, a market slug, or a condition id (0x and 64 hex digits).</>,
  },
  bad_address: {
    title: "That is not a wallet address",
    hint: <>A wallet address starts with <span className="num">0x</span> and has 40 hex characters. On Polymarket, copy it from the profile page.</>,
  },
  not_found: {
    title: "No such market",
    hint: "Polymarket has no market for that reference. It may be misspelled, or the event may have been removed.",
  },
  rate_limited: {
    title: "Easy, that was a lot of X-rays",
    hint: "Each live X-ray makes several requests to Polymarket, so they are limited per connection. A moment of rest and it will go through.",
  },
  upstream: {
    title: "Polymarket's public API is not answering",
    hint: "The X-ray reads Polymarket directly and its public API is slow or down right now. This is usually over within a minute.",
  },
  network: {
    title: "Could not reach the X-ray",
    hint: "Check your connection and try again.",
  },
  unknown: {
    title: "Something went wrong",
    hint: "The X-ray did not finish. Trying again usually works.",
  },
};

const KNOWN = new Set<string>(Object.keys(COPY));
export const failureCode = (code: string): FailureCode => (KNOWN.has(code) ? (code as FailureCode) : "unknown");

/** A friendly failure: what happened in plain words, what the server said, and a way forward. */
export function ErrorPanel({
  code = "unknown", message, onRetry, retryAfter, home = true,
}: { code?: FailureCode; message?: string; onRetry?: () => void; retryAfter?: number | null; home?: boolean }) {
  const c = COPY[code];
  return (
    <div role="alert" className="plate">
      <div className="flex items-start gap-4">
        <span aria-hidden className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-warn/40 bg-warn/10 text-warn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 8v5" /><path d="M12 16.5v.01" /><path d="M10.3 3.9L2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
          </svg>
        </span>
        <div className="min-w-0">
          <h2 className="text-base font-semibold leading-snug">{c.title}</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{c.hint}</p>
          {message && !["not_found", "bad_ref", "bad_address", "network"].includes(code) ? <p className="mt-2 break-words text-xs leading-relaxed text-faint">{message}</p> : null}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {onRetry ? (
              <button onClick={onRetry} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg hover:brightness-110">
                Try again{retryAfter ? ` (wait ${retryAfter} s first)` : ""}
              </button>
            ) : null}
            {home ? <Link href="/" className="text-sm text-accent underline">Back to search</Link> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
