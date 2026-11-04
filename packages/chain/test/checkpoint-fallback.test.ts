import { describe, expect, it } from "vitest";
import { anchorCheckpoint, latestCheckpointPublic } from "../src/suiGrpc.js";

const okFetch = (async () => new Response(JSON.stringify({ data: { checkpoint: { sequenceNumber: 341677268, digest: "D1", timestamp: "2026-11-04T20:33:55.722Z" } } }))) as unknown as typeof fetch;

describe("checkpoint fallback", () => {
  it("parses Sui public GraphQL", async () => {
    expect(await latestCheckpointPublic("http://x", okFetch)).toEqual({ sequence: "341677268", digest: "D1", timestamp: "2026-11-04T20:33:55.722Z" });
  });

  it("rejects a GraphQL answer without a checkpoint", async () => {
    const empty = (async () => new Response(JSON.stringify({ data: {} }))) as unknown as typeof fetch;
    await expect(latestCheckpointPublic("http://x", empty)).rejects.toThrow(/no checkpoint/);
  });

  it("labels the source when Tatum fails", async () => {
    const broken = { ledgerService: { getCheckpoint: async () => { throw new Error("402 Payment Required"); } } } as never;
    const c = await anchorCheckpoint(broken, () => latestCheckpointPublic("http://x", okFetch));
    expect(c.source).toBe("sui-public-graphql");
    expect(c.sequence).toBe("341677268");
    expect(c.fallbackReason).toMatch(/402/);
  });
});
