# CALIBRE MCP server

A stdio [Model Context Protocol](https://modelcontextprotocol.io) server with two read-only tools.

| Tool | What it does |
|---|---|
| `wallet_audit(address)` | Audits a Polymarket wallet's record against the prices it paid: pre-game and in-play edge with error bands (edge ± 2 standard errors), the share of bets at already-decided prices (sniping), a per-league breakdown and a verdict (proven edge, negative edge, too early, or no proven edge, consistent with luck). It is the same audit as the website's `/api/wallet/[address]`: the newest 1,000 trades from Polymarket's public Data API, resolutions and start times from Gamma, cached for 10 minutes. |
| `latest_verdicts(limit)` | The newest market-move verdicts sealed in Walrus Memory on Sui mainnet (1 to 50, default 5): market, label, forecast against price, Sui checkpoint and the Walruscan blob link. Read from `apps/web/data/verdicts.json`, which `pnpm export:site` writes. |

No API keys are needed. The server makes no Tatum calls.

## Add it to Claude Code

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
