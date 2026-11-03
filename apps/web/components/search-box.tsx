"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ADDRESS = /0x[0-9a-fA-F]{40}/;

/** Paste a wallet address (or a Polymarket profile link that contains one) and go to its live audit. */
export function SearchBox({ className = "", autoFocus = false }: { className?: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const match = ADDRESS.exec(value.trim());
    if (!match) {
      setError("Paste a wallet address that starts with 0x and has 40 hex characters.");
      return;
    }
    setError(null);
    router.push(`/wallet/${match[0].toLowerCase()}`);
  }

  return (
    <form onSubmit={submit} className={className} role="search">
      <label htmlFor="wallet-search" className="sr-only">Wallet address</label>
      <div className="flex gap-2">
        <input
          id="wallet-search"
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder="Audit a wallet: 0x…"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "wallet-search-error" : undefined}
          className="num min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button type="submit" className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-bg hover:brightness-110">
          Audit
        </button>
      </div>
      {error ? <p id="wallet-search-error" role="alert" className="mt-1.5 text-xs text-bad">{error}</p> : null}
    </form>
  );
}
