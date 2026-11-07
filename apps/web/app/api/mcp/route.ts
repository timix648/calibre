/**
 * CALIBRE's MCP server over HTTP, so an agent can use it with a URL instead of cloning the repository.
 *
 *   claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp
 *
 * The same two tools as the stdio server in apps/mcp (`wallet_audit`, `latest_verdicts`) from the same `createServer`, so the
 * two can never drift apart. Stateless: every request builds a transport, answers, and closes it, because a serverless
 * function keeps nothing between requests. Reads only public data and needs no key.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createServer, type SealedVerdict } from "@calibre/mcp/src/server";
import verdictsFile from "../../../data/verdicts.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The exported verdicts, imported at build time: a serverless function has no repository to read from. */
const verdicts = () => (verdictsFile as { verdicts: SealedVerdict[] }).verdicts;

/** One visitor should not be able to use up everyone's audits, so the rate limiter keys on the caller's address. */
function clientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "anonymous";
}

/**
 * A person who pastes this URL into a browser gets a plain GET with `Accept: text/html`, which the MCP transport correctly
 * refuses with 406 "Client must accept text/event-stream" — correct, and indistinguishable from a broken endpoint. Answer
 * those with something readable instead; a real MCP client always sends `text/event-stream` and never reaches this.
 */
function browserGet(req: Request): Response | null {
  if (req.method !== "GET") return null;
  const accept = req.headers.get("accept") ?? "";
  if (accept.includes("text/event-stream")) return null;
  return Response.json({
    name: "calibre",
    description: "CALIBRE's MCP server: audit a Polymarket wallet's record, and read the verdicts sealed in Walrus Memory.",
    transport: "streamable-http",
    tools: ["wallet_audit", "latest_verdicts"],
    add: "claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp",
    note: "This endpoint speaks JSON-RPC over HTTP POST. Opening it in a browser is not an error; point an MCP client at it.",
    docs: "https://calibre-blush.vercel.app/agents",
  });
}

async function handle(req: Request): Promise<Response> {
  const friendly = browserGet(req);
  if (friendly) return friendly;
  const server = createServer({ verdicts, clientId: () => clientId(req) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless: nothing survives between requests here
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown error";
    return Response.json({ jsonrpc: "2.0", error: { code: -32603, message: `Internal error: ${message}` }, id: null }, { status: 500 });
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
