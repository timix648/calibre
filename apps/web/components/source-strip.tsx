import type { XrayAnchor } from "@calibre/public-data";
import { suiscanCheckpoint, utc } from "@/lib/format";

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;

/**
 * Where an X-ray's data came from, in one line: the Sui checkpoint it was read at (through Tatum's Sui gRPC, or the labelled
 * public fallback), where the fills came from, and Tatum's view of the wallet when there is one.
 */
export function SourceStrip({
  anchor, fills, tatumWallet, tatumMarket,
}: {
  tatumMarket?: { yesPrice: number | null; status: string; volume: number } | null;
  anchor?: XrayAnchor | null;
  fills?: "tatum" | "polymarket-public";
  tatumWallet?: { openValueUsd: number | null; marketsTraded: number | null } | null;
}) {
  const items: { key: string; tatum: boolean; body: React.ReactNode }[] = [];
  if (anchor) {
    items.push({
      key: "anchor",
      tatum: anchor.source === "tatum-grpc",
      body: (
        <>
          Read at Sui checkpoint{" "}
          <a className="num text-fg underline decoration-line hover:decoration-accent" href={suiscanCheckpoint(anchor.sequence)} target="_blank" rel="noreferrer">
            {Number(anchor.sequence).toLocaleString("en-US")}
          </a>
          {anchor.timestamp ? <span className="text-faint"> ({utc(anchor.timestamp)})</span> : null}
          {anchor.source === "tatum-grpc" ? " via Tatum Sui gRPC" : " via Sui public GraphQL (Tatum paused)"}
        </>
      ),
    });
  }
  if (tatumMarket && tatumMarket.yesPrice !== null) {
    items.push({
      key: "tatum-market",
      tatum: true,
      body: <>Tatum live price: YES <span className="num text-fg">{(tatumMarket.yesPrice * 100).toFixed(1)}%</span>{tatumMarket.volume > 0 ? <>, <span className="num text-fg">{usd(tatumMarket.volume)}</span> traded</> : null}</>,
    });
  }
  if (fills) {
    items.push({
      key: "fills",
      tatum: fills === "tatum",
      body: fills === "tatum" ? "Fills from Tatum's Prediction Markets API" : "Fills from Polymarket's public Data API (Tatum fallback)",
    });
  }
  if (tatumWallet && (tatumWallet.openValueUsd !== null || tatumWallet.marketsTraded !== null)) {
    items.push({
      key: "wallet",
      tatum: true,
      body: (
        <>
          Tatum:{" "}
          {tatumWallet.openValueUsd !== null ? <span className="num text-fg">{usd(tatumWallet.openValueUsd)}</span> : null}
          {tatumWallet.openValueUsd !== null ? " in open positions" : ""}
          {tatumWallet.openValueUsd !== null && tatumWallet.marketsTraded !== null ? ", " : ""}
          {tatumWallet.marketsTraded !== null ? <><span className="num text-fg">{tatumWallet.marketsTraded.toLocaleString("en-US")}</span> markets traded</> : null}
        </>
      ),
    });
  }
  if (items.length === 0) return null;
  return (
    <ul data-stagger className="flex flex-wrap gap-2 text-xs text-muted" aria-label="Data sources">
      {items.map((it) => (
        <li key={it.key} className={`cut inline-flex items-center gap-2 px-3 py-1.5 ${it.tatum ? "bg-accent/10" : "bg-white/[0.04]"}`}>
          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${it.tatum ? "bg-accent" : "bg-faint"}`} />
          <span>{it.body}</span>
        </li>
      ))}
    </ul>
  );
}
