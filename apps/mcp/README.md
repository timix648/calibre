# CALIBRE MCP server

A [Model Context Protocol](https://modelcontextprotocol.io) server with two read-only tools, served two ways: over HTTP at
`https://calibre-blush.vercel.app/api/mcp`, and over stdio from this package. Both come from the same `createServer`, so
they cannot drift apart.

| Tool | What it does |
|---|---|
| `wallet_audit(address)` | Audits a Polymarket wallet's record against the prices it paid: pre-game and in-play edge with error bands (edge ± 2 standard errors), the share of bets at already-decided prices (sniping), a per-league breakdown and a verdict (proven edge, negative edge, too early, or no proven edge, consistent with luck). It is the same audit as the website's `/api/wallet/[address]`: the newest 1,000 trades from Polymarket's public Data API, resolutions and start times from Gamma, cached for 10 minutes. |
| `latest_verdicts(limit)` | The newest market-move verdicts sealed in Walrus Memory on Sui mainnet (1 to 50, default 5): market, label, forecast against price, Sui checkpoint and the Walruscan blob link. The hosted server reads the record Walrus holds; the stdio server reads `apps/web/data/verdicts.json`, which `pnpm export:site` writes. |

No API keys are needed. The server makes no Tatum calls.

## Add it

MCP is an open protocol, so this is not tied to any one assistant.

**Hosted, nothing to install.** In Claude Code:

```sh
claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp
```

In Claude Desktop, Cursor, VS Code, Windsurf, Cline or Goose, add a remote/HTTP MCP server with that URL. Anywhere else it
is plain JSON-RPC over HTTP, so anything that can POST can call it:

```sh
curl -s -X POST https://calibre-blush.vercel.app/api/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

## Or run it locally over stdio

From the repository root, after `pnpm install`:

```sh
claude mcp add calibre -- pnpm --silent exec tsx apps/mcp/src/index.ts
```

From anywhere else, point pnpm at the repository (use your own path):

```sh
claude mcp add calibre -- pnpm --silent --dir /path/to/calibre exec tsx apps/mcp/src/index.ts
```

`--silent` matters: stdout carries the protocol, and pnpm's banner would corrupt it.

Then ask, for example: "Audit wallet 0x684baa57c338c2549aec0aa3f034f695d72a8409" or "What are CALIBRE's latest verdicts?".

For any other MCP client, the command is `pnpm --silent --dir /path/to/calibre exec tsx apps/mcp/src/index.ts` over stdio.

## Test

```sh
pnpm test
```
