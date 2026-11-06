import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RateLimiter, TtlCache, auditAddress, isAddress, type WalletAuditResult } from "@calibre/public-data";
import { z } from "zod";
import { auditReport } from "./format";

export interface SealedVerdict {
  id: string;
  blobId: string;
  walruscan: string;
  data: {
    question: string; league: string; label: string; yesOutcome: string; sharpShare: number; forecast: number; priceAtVerdict: number;
    move: { from: number; to: number; startTs: number; endTs: number };
    checkpoint: { sequence: string }; sealedAt: string; model?: string; source?: string;
    /** Model v3: the share of the pushing money from proven losers and how much of the money was judged. Older verdicts omit both. */
    squareShare?: number; squareCoverage?: number;
  };
}

type TextResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (t: string, isError = false): TextResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

export interface ServerDeps {
  audit?: (address: string) => Promise<WalletAuditResult>;
  /**
   * The sealed verdicts. Supplied by the caller rather than read here, because this module is bundled into the website as
   * well: the stdio server in index.ts reads the exported JSON from disk, and the website imports it at build time (a
   * serverless function has no repository to read). Keeping `node:fs` out of here is what lets both share these tools.
   */
  verdicts?: () => Promise<SealedVerdict[]> | SealedVerdict[];
  /** Identifies the caller to the rate limiter, so one visitor cannot use up everyone's audits. Defaults to "stdio". */
  clientId?: () => string;
}

/** The CALIBRE MCP server: `wallet_audit(address)` and `latest_verdicts(limit)`. */
export function createServer(deps: ServerDeps = {}): McpServer {
  const cache = new TtlCache<WalletAuditResult>(10 * 60_000, 200);
  const limiter = new RateLimiter(20, 60_000);
  const audit = deps.audit ?? ((address: string) => auditAddress(address, { maxTrades: 1000 }));
  const server = new McpServer({ name: "calibre", version: "0.1.0" });

  server.registerTool(
    "wallet_audit",
    {
      title: "Audit a Polymarket wallet",
      description:
        "Audit a Polymarket wallet's real record against the prices it paid: pre-game and in-play edge with error bands (edge ± 2 standard errors), " +
        "the share of bets at already-decided prices (sniping), a per-league breakdown, and a verdict: proven edge, negative edge, too early, or " +
        "no proven edge (consistent with luck). Reads the newest 1,000 trades from Polymarket's public API.",
      inputSchema: { address: z.string().min(1).max(100).describe("Wallet address, 0x followed by 40 hex characters") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ address }) => {
      if (!isAddress(address)) return text("That is not a wallet address. It should be 0x followed by 40 hex characters.", true);
      const key = address.toLowerCase();
      try {
        let result = cache.get(key);
        if (!result) {
          const wait = limiter.hit(deps.clientId?.() ?? "stdio");
          if (wait > 0) return text(`Too many audits in a short time. Try again in ${wait} seconds.`, true);
          result = await audit(key);
          cache.set(key, result);
        }
        return { content: [{ type: "text", text: auditReport(result) }, { type: "text", text: JSON.stringify(result.audit) }] };
      } catch (e) {
        return text(`Could not audit this wallet: ${(e as Error).message}`, true);
      }
    },
  );

  server.registerTool(
    "latest_verdicts",
    {
      title: "Latest sealed verdicts",
      description:
        "The most recent market-move verdicts CALIBRE sealed in Walrus Memory on Sui mainnet, newest first: market, label, forecast against price, " +
        "Sui checkpoint and the Walruscan blob link.",
      inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many verdicts to return, 1 to 50 (default 5)") },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      let rows: SealedVerdict[];
      try {
        if (!deps.verdicts) return text("This server was started without the exported verdicts.", true);
        rows = await deps.verdicts();
      } catch {
        return text("No exported verdicts found. Run `pnpm export:site` in the CALIBRE repository first.", true);
      }
      const shown = [...rows].sort((a, b) => b.data.sealedAt.localeCompare(a.data.sealedAt)).slice(0, limit ?? 5);
      if (shown.length === 0) return text("No verdicts have been sealed yet.");
      const out = shown.map((v) => ({
        market: v.data.question,
        league: v.data.league,
        label: v.data.label,
        move: `${v.data.yesOutcome} ${(v.data.move.from * 100).toFixed(0)}% to ${(v.data.move.to * 100).toFixed(0)}%`,
        forecast: Number(v.data.forecast.toFixed(3)),
        priceAtVerdict: Number(v.data.priceAtVerdict.toFixed(3)),
        learnedEdgeShare: Number(v.data.sharpShare.toFixed(3)),
        model: v.data.model ?? "v1",
        squareMoney: typeof v.data.squareShare === "number" && typeof v.data.squareCoverage === "number"
          ? { share: Number(v.data.squareShare.toFixed(3)), coverage: Number(v.data.squareCoverage.toFixed(3)) }
          : null,
        dataSource: v.data.source ?? "tatum",
        suiCheckpoint: v.data.checkpoint.sequence,
        sealedAt: v.data.sealedAt,
        blob: v.walruscan,
      }));
      return text(JSON.stringify(out, null, 2));
    },
  );

  return server;
}
