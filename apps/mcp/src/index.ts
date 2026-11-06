import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer, type SealedVerdict } from "./server.js";

/** The exported verdicts the website shows (written by `pnpm export:site`). */
export const VERDICTS_FILE = fileURLToPath(new URL("../../web/data/verdicts.json", import.meta.url));

/** Reading them from disk belongs to this entry point, not to server.ts, which the website bundles too. */
const verdicts = async (): Promise<SealedVerdict[]> =>
  (JSON.parse(await readFile(process.env.CALIBRE_VERDICTS_FILE || VERDICTS_FILE, "utf8")) as { verdicts: SealedVerdict[] }).verdicts;

// stdio transport: stdout carries the protocol, so log to stderr only.
const server = createServer({ verdicts });
await server.connect(new StdioServerTransport());
console.error("calibre MCP server ready: tools wallet_audit, latest_verdicts");
