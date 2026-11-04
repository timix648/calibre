"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { routeInput } from "@/lib/route-input";

/**
 * One box for everything: a Polymarket profile link, a wallet address, an @username, or a market or event link. It decides
 * where to go (wallet X-ray or market X-ray) and looks usernames up first.
 */
export function SmartInput({
  className = "", autoFocus = false, large = false, placeholder, button = "X-ray",
}: { className?: string; autoFocus?: boolean; large?: boolean; placeholder?: string; button?: string }) {
  const router = useRouter();
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const routed = routeInput(value);
    if (routed.kind === "error") { setError(routed.message); return; }
    setError(null);
    if (routed.kind === "href") { router.push(routed.href); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/xray/handle/${encodeURIComponent(routed.handle)}`);
      const body = (await res.json().catch(() => null)) as { ok: boolean; address?: string; error?: string } | null;
      if (body?.ok && body.address) router.push(`/wallet/${body.address}`);
      else setError(body?.error ?? "Could not look that username up. Paste the wallet address from the profile page instead.");
    } catch {
      setError("Could not look that username up. Paste the wallet address from the profile page instead.");
    } finally {
      setBusy(false);
    }
  }

  const pad = large ? "px-4 py-3.5 text-base" : "px-3 py-2 text-sm";
  return (
    <form onSubmit={submit} className={className} role="search">
      <label htmlFor={id} className="sr-only">Polymarket profile link, wallet address, or market link</label>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          placeholder={placeholder ?? "Paste a Polymarket profile, wallet, or market link"}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={`min-w-0 flex-1 rounded-lg border border-line bg-panel text-fg placeholder:text-faint focus:border-accent focus:outline-none ${pad}`}
        />
        <button
          type="submit"
          disabled={busy}
          className={`shrink-0 rounded-lg bg-accent font-semibold text-bg hover:brightness-110 disabled:opacity-60 ${large ? "px-6 py-3.5 text-base" : "px-3.5 py-2 text-sm"}`}
        >
          {busy ? "Looking up" : button}
        </button>
      </div>
      {error ? <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs text-bad">{error}</p> : null}
    </form>
  );
}
