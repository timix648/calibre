import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// stdio transport: stdout carries the protocol, so log to stderr only.
const server = createServer();
await server.connect(new StdioServerTransport());
console.error("calibre MCP server ready: tools wallet_audit, latest_verdicts");
