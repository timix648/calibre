# CALIBRE: Whale X-ray for prediction markets

Before you chase a price move or copy a whale, see whether the money behind it comes from traders who reliably lose.

**Live:** https://calibre-blush.vercel.app · Built for **Total Recall: Tatum x Walrus Memory** (Track 01, Markets & Sports Prediction)

On Polymarket a market jumps 8 points and everyone asks who knows something. Usually nobody does. CALIBRE looks at the wallets
that pushed the price, scores each one against the prices it actually paid on its past bets, and tells you in plain words
whether the move came from proven losers, from the rare proven winner, or from wallets with no record either way. Every judgement
on a live move is sealed on Walrus Memory before the result is known, and graded in public afterwards.

## What it does

| | |
|---|---|
| **Wallet X-ray** (`/wallet/<address>`) | Edge per bet against the price paid, with an error band; pre-game and in-play split; share of "sniping" bets at already-decided prices; a label: *proven losing record*, *proven winning record*, *mostly sniping*, *too early*, *no proven edge*. |
| **Market X-ray** (`/market/<slug>`) | The latest move of 4+ points, its biggest takers, and how much of the pushing money came from proven losers (with how much of it could be judged). A price settling at 0 or 1 is not treated as a move. |
| **Radar** (`/radar`) | Moves the watcher judged and sealed, newest first. |
| **Record** (`/record`) | Every sealed verdict with its grade once the market resolved. |
| **Chrome extension** (`apps/extension`) | The same X-ray as a panel on polymarket.com profile, event, sports and esports pages. |
| **Paid agent API** (`/api/v1/xray/<address>`) | The wallet X-ray for agents at 0.01 USDC per call over MPP on Sui. Gasless for the buyer. |
| **MCP server** (`apps/mcp`) | `wallet_audit` and `latest_verdicts` for Claude Code or any MCP client. No keys needed. |

The site holds no keys and makes no Tatum calls: wallet and market X-rays read Polymarket's free public APIs at request time, and the
radar, record and proof pages read files exported from Walrus Memory.

## Does the label mean anything? The evidence

All numbers come from scripts in this repository and are written up in [`docs/FINDINGS.md`](docs/FINDINGS.md).

**1. The labels predict what a wallet does next.** 1,000 wallets sampled without looking at profit. Each wallet gets the label it
would have had from its older half of bets; the table shows its newer half.

| Label from older bets | Wallets | Next-half edge, pts per bet [95% CI] | Negative next half |
|---|---:|---|---:|
| proven losing record | 57 | **-3.8** [-5.1, -2.4] | 81% |
| proven winning record (rare, strict) | 40 | **+2.2** [+0.5, +4.1] | 38% |
| no proven edge | 801 | -1.0 [-1.3, -0.7] | 60% |

A proven losing record is the strongest signal CALIBRE has. Proven winners exist but are rare and modest. The profit leaderboard
carries no persistent signal at all (rank correlation -0.04, p 0.57).

**2. Following loser-driven moves paid worse: early evidence, not conclusive.** A replay of 11,975 real moves of 6+ points in
4,587 closed sports markets, labelling each move's takers only with bets that had resolved before the move:

| Moves pushed by | Moves | Follow edge, pts [95% CI] |
|---|---:|---|
| proven losers (50%+ of labeled flow) | 436 | -2.4 [-6.4, +1.4] |
| no proven losers | 3,597 | +0.7 [-0.7, +2.1] |

Difference -3.1 pts, one-sided permutation p = 0.073, mostly in-play. That is why square money is shown as a caution and CALIBRE
never tells anyone to trade against it.

**3. The sealed forecasts so far are level with the market.** 48 verdicts are graded on mainnet. Under the current models (v2
and v3, 46 verdicts) CALIBRE's forecast and the market price score within 0.001 Brier of each other; the 2 graded verdicts of
the first model are too few to count. The forecast is deliberately conservative (it moves the price at most 10 points): the
product is the X-ray, not a price prediction, and the record is public so this can be checked.

## How Walrus Memory is used

Walrus Memory (`@mysten-incubation/memwal`, Sui mainnet) is the system of record, not a cache:

- **`calibre-verdicts`**: when the watcher sees a move, it seals a verdict (label, forecast, price, takers with their labels,
  square-money share, the Sui checkpoint at that moment) *before* the market resolves. Failed or timed-out writes are retried
  with their original checkpoint and dropped if the market resolves first, so nothing is sealed with hindsight.
- **`calibre-outcomes`**: when the market resolves, the grader seals an outcome memory pointing at the verdict, with its Brier
  score against the market price.
- **`calibre-wallets`**: wallet-by-league track records. Memory is append-only, so a new record is a new version
  (`[cal1|kind|key|vN] summary || {json}`) and readers keep the latest version per key.

The proof page and the radar are rebuilt from Walrus alone: `pnpm verify` lists each namespace, recalls and decodes every verdict
and outcome, checks that each outcome has its verdict, and writes [`docs/PROOF.md`](docs/PROOF.md). Every row links to its blob
on Walruscan. Current counts: 59 verdicts, 48 outcomes, 271 wallet records.

## How Tatum is used

- **Prediction Markets API** (`/v4/data/prediction`): market discovery, price history and trades for the watcher, and the
  resolution check for grading (`packages/chain/src/prediction.ts`, budgeted, cached, retried).
- **Sui gRPC gateway** (`sui-mainnet-grpc.gateway.tatum.io`): the latest checkpoint stamped into every sealed verdict
  (`packages/chain/src/suiGrpc.ts`).

Each has a labelled fallback, and the site says which source answered. When Tatum's trade history was down during the
hackathon, trades came from Polymarket's public Data API. When the free credits ran out, resolutions came from Gamma and the
checkpoint from Sui's public GraphQL.

## Agent payments

`GET /api/v1/xray/<address>` answers 402 with an MPP challenge; the agent pays 0.01 USDC on Sui, the server checks the
transaction on chain and returns the X-ray with the digest as its receipt. Each digest pays for one call.

First real call, 4 Nov 2026: [`9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K`](https://suiscan.xyz/mainnet/tx/9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K),
checkpoint 341674249, 0.01 USDC from the agent to the API's wallet, gas price 0. Details: [`docs/AGENT_PAYMENTS.md`](docs/AGENT_PAYMENTS.md).

## Layout

| Path | What |
|---|---|
| `packages/core` | Edge metric, shrinkage, labels, square-money share, verdicts, grading, memory envelopes. Pure and tested. |
| `packages/public-data` | Wallet and market X-rays from Polymarket's public Data API and Gamma. |
| `packages/chain` | Tatum Prediction Markets client, Sui checkpoint (Tatum gRPC with public fallback). |
| `packages/memory` | Walrus Memory store, namespaces, encode and decode. |
| `apps/worker` | `watch` (judge and seal moves), `grade` (seal outcomes), `index` (wallet records). |
| `apps/web` | Next.js site and the free and paid APIs. |
| `apps/extension` | Chrome MV3 panel for polymarket.com. |
| `apps/mcp` | MCP server over stdio. |
| `scripts` | The studies (`skill-persistence.ts`, `validate-labels.ts`, `square-replay.ts`), `verify.ts`, `export-site.ts`, `agent-pay-demo.ts`. |

## Run it

```bash
pnpm install
pnpm test                         # 278 tests
pnpm --filter @calibre/web dev    # the site on http://localhost:3000, no keys needed
```

With keys in `.env` (copy `.env.example`: a free Tatum key, a Walrus Memory delegate key and account ID):

```bash
pnpm verify          # rebuild the proof from Walrus Memory
pnpm watch           # judge and seal live moves
pnpm grade           # grade resolved verdicts
pnpm export:site     # refresh apps/web/data from Walrus
```

Extension: `pnpm --filter @calibre/extension build`, then load `apps/extension/dist` unpacked in `chrome://extensions`. MCP:
`claude mcp add calibre -- pnpm --silent exec tsx apps/mcp/src/index.ts`.

## Limits

- Edge is measured against the price paid and ignores fees and bet size. Wallets trade the same events, so intervals are optimistic.
- The wallet X-ray reads a wallet's newest 1,000 trades; a long history is judged on its recent part.
- The square-money result is p = 0.073. It is early evidence, and the product says so wherever it appears.
- 271 wallet records are sealed on Walrus; the watcher labels takers from a larger local index (5,740 wallets) that is not all sealed.
