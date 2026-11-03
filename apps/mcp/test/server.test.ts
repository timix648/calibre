import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { auditWallet, type ResolutionLike, type TradeLike } from "@calibre/core";
import type { WalletAuditResult } from "@calibre/public-data";
import { describe, expect, it, vi } from "vitest";
import { createServer, type ServerDeps } from "../src/server.js";

async function connect(deps: ServerDeps) {
  const server = createServer(deps);
  const client = new Client({ name: "test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

const text = (r: unknown) => ((r as { content: { text: string }[] }).content[0]?.text ?? "");
const ADDRESS = "0x684baa57c338c2549aec0aa3f034f695d72a8409";

function fakeAudit(): WalletAuditResult {
  const start = Date.parse("2026-11-02T00:00:00Z");
  const trades: TradeLike[] = [];
  const res = new Map<string, ResolutionLike | null>();
  for (let i = 0; i < 120; i++) {
    trades.push({ conditionId: `m${i}`, side: "BUY", price: 0.5, size: 10, timestamp: start / 1000 - 3600, outcome: "A", slug: "nba-aaa-bbb-2026-11-02" });
    res.set(`m${i}`, { outcome: i < 80 ? "A" : "B", startTs: start });
  }
  return {
    address: ADDRESS, name: "tester", audit: auditWallet(trades, res), tradesFetched: 120, truncated: false,
    firstTradeAt: 1, lastTradeAt: 2, fetchedAt: "2026-11-03T00:00:00.000Z", source: "polymarket-public",
  };
}

describe("MCP server", () => {
  it("lists both tools", async () => {
    const client = await connect({});
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["latest_verdicts", "wallet_audit"]);
  });

  it("wallet_audit reports the verdict and caches repeat calls", async () => {
    const audit = vi.fn(async () => fakeAudit());
    const client = await connect({ audit });
    const first = await client.callTool({ name: "wallet_audit", arguments: { address: ADDRESS.toUpperCase().replace("0X", "0x") } });
    expect(text(first)).toContain("Verdict: proven edge");
    expect(text(first)).toContain("Pre-game: edge +16.7 pts");
    await client.callTool({ name: "wallet_audit", arguments: { address: ADDRESS } });
    expect(audit).toHaveBeenCalledTimes(1);
  });

  it("wallet_audit rejects a bad address and reports upstream failures", async () => {
    const client = await connect({ audit: async () => { throw new Error("Polymarket did not answer"); } });
    const bad = await client.callTool({ name: "wallet_audit", arguments: { address: "0x123" } });
    expect(bad.isError).toBe(true);
    const failed = await client.callTool({ name: "wallet_audit", arguments: { address: ADDRESS } });
    expect(failed.isError).toBe(true);
    expect(text(failed)).toContain("Polymarket did not answer");
  });

  it("latest_verdicts returns the newest first, limited", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "calibre-mcp-"));
    const file = path.join(dir, "verdicts.json");
    const row = (n: number) => ({
      id: `v${n}`, blobId: `blob${n}`, walruscan: `https://walruscan.com/mainnet/blob/blob${n}`,
      data: {
        question: `Market ${n}`, league: "nba", label: "noise", yesOutcome: "Yes", sharpShare: 0.1, forecast: 0.5, priceAtVerdict: 0.48,
        move: { from: 0.4, to: 0.5, startTs: 1, endTs: 2 }, checkpoint: { sequence: String(100 + n) }, sealedAt: `2026-11-0${n}T00:00:00Z`,
      },
    });
    await writeFile(file, JSON.stringify({ verdicts: [row(1), row(3), row(2)] }));
    const client = await connect({ verdictsFile: file });
    const r = await client.callTool({ name: "latest_verdicts", arguments: { limit: 2 } });
    const parsed = JSON.parse(text(r)) as { market: string; model: string; dataSource: string }[];
    expect(parsed.map((p) => p.market)).toEqual(["Market 3", "Market 2"]);
    expect(parsed[0]).toMatchObject({ model: "v1", dataSource: "tatum" });
  });

  it("latest_verdicts explains a missing export", async () => {
    const client = await connect({ verdictsFile: path.join(tmpdir(), "does-not-exist.json") });
    const r = await client.callTool({ name: "latest_verdicts", arguments: {} });
    expect(r.isError).toBe(true);
  });
});
