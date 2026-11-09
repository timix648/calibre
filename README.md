# CALIBRE: Whale X-ray for prediction markets

Before you chase a price move or copy a whale, see whether the money behind it comes from traders who reliably lose.

**Live:** https://calibre-blush.vercel.app · **Demo video (2:44):** https://youtu.be/-FlnLNTNff0 · **Write-up:** https://dev.to/0xgenzero/who-is-really-behind-that-polymarket-move-3jga
Built for **Total Recall: Tatum x Walrus Memory** (Track 01, Markets & Sports Prediction)

On Polymarket a market jumps 8 points and everyone asks who knows something. Usually nobody does. CALIBRE looks at the wallets
that pushed the price, scores each one against the prices it actually paid on its past bets, and tells you in plain words
whether the move came from proven losers, from the rare proven winner, or from wallets with no record either way. Every judgement
on a live move is sealed on Walrus Memory before the result is known, and graded in public afterwards.

![The CALIBRE panel on a Polymarket profile up $1.3M, labelling the wallet no proven edge](apps/web/public/extension-panel.png)

*The Chrome extension on a live Polymarket profile: up $1.3M, yet over 656 bets its edge is within what luck produces.*

## Three minutes, if that is all you have

Nothing to install, nothing to clone. In order:

1. **[`/market/...`](https://calibre-blush.vercel.app) — paste any Polymarket market or event link.** You get the latest
   move, the wallets that pushed it, each one's record, and what share of the pushing money came from traders with a proven
   losing record. Note the line that says how much of the money it *could* judge; a tool that hides its coverage is hiding
   its error bars.
2. **[`/record`](https://calibre-blush.vercel.app/record) — the scorecard.** 174 verdicts sealed before the result, 110
   graded since. CALIBRE's Brier against the market's Brier on the same events. We do not beat the price, and the page says
   so in the heading rather than in a footnote.
3. **[`/proof`](https://calibre-blush.vercel.app/proof) — the receipts.** Every namespace, every blob on Walruscan, every
   Sui checkpoint on Suiscan, and the one settled agent payment. The heading tells you whether you are looking at a live
   Walrus read or the fallback export, with the time.
4. **One curl, no key:** `curl -i https://calibre-blush.vercel.app/api/v1/xray/0x0000000000000000000000000000000000000000`
   returns the **402 payment challenge**. Add the MCP server to your own client with
   `claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp`.
5. **[The demo (2:44)](https://youtu.be/-FlnLNTNff0)** if you would rather watch than click.

## What was actually built

This is not a landing page with an API call behind it. Eight workspaces, **14,432 lines of TypeScript across 163 files**,
and **292 tests in 29 files, all passing** (`pnpm test`, no network needed — the fixtures are checked in).

| Workspace | What it is |
|---|---|
| `packages/core` | The scoring model: edge against the price paid, Wilson-style error bands, the sniping detector, the labels, the forecast model (v1→v3) and the Brier grading |
| `packages/chain` | The Tatum client — Prediction Markets REST plus the Sui gRPC gateway over native gRPC — with per-endpoint credit pricing, a daily credit budget, an hourly throttle, retry and a disk cache |
| `packages/memory` | Walrus Memory: the Seal-encrypted store, the versioned envelope format, and the rebuild that reconstructs everything from recall alone |
| `packages/public-data` | Polymarket's free Gamma and Data APIs, used for the parts Tatum cannot answer, with the v1→v2 migration Polymarket forced mid-hackathon |
| `apps/web` | The Next.js site: wallet and market X-rays rendered live on the server, radar, record, proof, agents, the paid 402 endpoint and the hosted MCP server |
| `apps/worker` | The watcher that finds moves, gates them against Tatum, judges and seals them; and the grader that resolves, scores and re-versions wallet records |
| `apps/mcp` | The same MCP tools over stdio, for clients that prefer a local server |
| `apps/extension` | The Chrome extension: the X-ray as a panel on polymarket.com profile, event, sports and esports pages |

And the studies that produced the evidence below, in `scripts/`: the 1,000-wallet label validation, the 11,975-move square-money
replay, the scale summary, and a Tatum cost model that measures what each endpoint actually costs in credits rather than
guessing.

## Does it fit Track 01? Line by line

The track asks for a "prediction app for sports, elections, culture or markets" that can "compare bookmaker odds with onchain
sources", "track which voices were right", let "users log picks before events", and use "memory [to store] credibility scores
so the app learns who to trust" — with "pick journals with post-game scorecards" and "odds dashboards that flag when sources
disagree" as the worked examples. Where each of those lives in CALIBRE:

| The brief | In CALIBRE |
|---|---|
| Prediction app for sports or markets | Polymarket sports markets across 142 leagues. Every page is a judgement about a live market. |
| Compare bookmaker odds with onchain sources | **The move gate.** A candidate move is checked against Tatum's own price history before anything is judged. If Tatum answers and its history does **not** show the move, the move is dropped and never sealed. If Tatum cannot answer — hourly budget spent, empty series — the verdict proceeds on Polymarket's feed and records the reason in the verdict itself, so every one of the 174 says which source it stands on and why. See [How Tatum is used](#how-tatum-is-used) for the per-verdict provenance. |
| Track which voices were right | The "voices" are the wallets that actually move the price, scored against the prices they paid — not self-declared analysts. 790,185 bets scored across 5,740 wallets. |
| Users log picks before events | **The one line CALIBRE reads differently.** The picks logged before the event are the agent's own, not a user's: the watcher seals a forecast on Walrus Memory with a Sui checkpoint *before* the market resolves, so the timing is not something anyone can assert after the fact. A user-entered pick journal cannot be proven to have been entered early. This one can. |
| Memory stores credibility scores so the app learns who to trust | `calibre-wallets` is exactly that: 337 versioned credibility records, one per wallet and league. Walrus Memory has no update, so a changed judgement is a new version and the old one stays readable. The labels on the next move come from those records. |
| *"pick journals with post-game scorecards"* | [`/record`](https://calibre-blush.vercel.app/record) — every sealed verdict with its Brier score once the market resolved, next to the market price for the same event. Nothing is pooled across model versions. |
| *"odds dashboards that flag when sources disagree"* | Every X-ray names the source that answered it and why, and the move gate above is the disagreement flag with teeth: it refuses to publish rather than quietly picking a side. |

The honest summary: CALIBRE answers "who moved this price, and do they have a record?" rather than "what will happen?". It does
not beat the market price on Brier and says so on the record page. What it adds is the part the price does not tell you.

## The two special prizes, and why this qualifies for both

The hackathon's criteria are **30% integration, 30% technical quality, 20% creativity, 20% presentation**, with two $500
specials on top of the track. CALIBRE is built for Track 01 plus both specials, and this section is the evidence for each,
with the file to read and the thing to click.

### Best Walrus Memory

Walrus Memory is the system of record here, not a cache in front of a database. There is no database. If you delete the
exported JSON in `apps/web/data` the site still works, because the pages recall from Walrus at render time; if you delete
Walrus, there is nothing left to recover from. That is the test of whether memory is load-bearing, and CALIBRE passes it.

| What the award looks for | The evidence | Where |
|---|---|---|
| Memory that is actually written to, at volume | **764 memories** across 3 namespaces on Walrus mainnet: 337 wallet credibility records, 174 sealed verdicts, 110 graded outcomes, plus the model cards | [`/proof`](https://calibre-blush.vercel.app/proof) lists every namespace with counts |
| Memory that is read back and *changes behaviour* | A verdict's labels come from recalled wallet records. Re-score a wallet and the next move it pushes is labelled differently — that is the loop, not a report | `apps/worker/src/watch.ts`, `loadMemoryState` |
| Handling the append-only constraint properly | Walrus Memory has **no update and no delete**. A changed judgement is a new version under the same key: `[cal1\|kind\|key\|vN] summary \|\| {json}`. Readers keep the highest version per key. **117 of the 126 wallet records written from my machine now carry a v2** that supersedes a v1 — and the v1 is still there, readable, which is exactly what a record of a changed judgement should look like | `packages/memory/src/envelope.ts`, `rebuild.ts` |
| Encryption | Every memory is sealed with Seal before it leaves the process; recall decrypts on the relayer | `packages/memory/src/store.ts` |
| Working around the real limits | Recall returns **at most 100 memories per query**. Past that, one query can no longer see a namespace, so the rebuild merges five semantic queries and dedupes by blob ID. Measured: the merged read takes 25–33s, a single query 8–13s. The site runs the merged read with a 50s budget and falls back to the last export if Walrus has a bad minute — and **says on the page which one you are reading** | `packages/memory/src/rebuild.ts`, `apps/web/lib/live-record.ts` |
| Provable ordering, not just storage | Each verdict carries the **Sui checkpoint** current at the moment it was sealed. That is what makes "CALIBRE called this before the result" checkable by a stranger rather than asserted by me | every verdict's `checkpoint`, linked to Suiscan from `/proof` |
| Reproducible by a third party | `pnpm verify` rebuilds the entire record **from Walrus alone** — lists each namespace, recalls and decodes every memory, checks that every outcome points at a verdict that exists, and prints a Walruscan link per blob. No local state involved | [Rebuild the proof yourself](#rebuild-the-proof-yourself) |

The honest caveat, stated because a judge will find it: a write can time out and still land. One did. An export found 59
verdicts against 58 in the local ledger, because Walrus had accepted a write the client gave up on. Retries now reuse the
original checkpoint and are dropped if the market resolved in the meantime, so nothing can be sealed with hindsight.

### Best Use of Agent Payments

The award requires **x402 or MPP settled on Sui**. CALIBRE's paid endpoint is a real one, settled on mainnet, and it is the
same X-ray the site serves — not a demo route built to satisfy the rule.

| What the award looks for | The evidence |
|---|---|
| A real 402 challenge | `GET /api/v1/xray/<wallet>` with no payment answers **HTTP 402** with an MPP challenge naming the asset, amount and recipient. Try it: `curl -i https://calibre-blush.vercel.app/api/v1/xray/0x...` |
| Settled on Sui mainnet | **Digest `9edpkVC9QQegXDDwvxEt5dZyd2NZ36vBLw2yaqknF86K`, checkpoint 341,674,249**, 4 Nov 2026 20:21:41 UTC: 0.01 USDC from the agent to the API wallet, status SUCCESS. Linked from [`/proof`](https://calibre-blush.vercel.app/proof) to Suiscan |
| Gasless for the buyer | **Gas price 0.** The paying agent needs USDC and nothing else — no SUI, no faucet, no funding step. That is the part that makes agent payment actually usable |
| Verified on chain, through Tatum | The server does not trust the client's claim of payment. It resolves the digest **through Tatum's Sui gateway** and checks the recipient, the asset and the amount before releasing a byte. A digest buys exactly one call and is refused the second time |
| No account, no key, no signup | The buyer never registers. The payment *is* the authentication — which is the whole point of agent payments, and the reason this endpoint has no API key to leak |
| Honest about volume | **One settled mainnet call so far.** The mechanism is real and reproducible with `pnpm agent:pay` against your own wallet; the traffic is not, because nothing has had reason to buy an X-ray yet. I would rather show one verifiable digest than a number you cannot check |
| Priced for agents | 0.01 USDC per X-ray, chosen so an agent scanning a slate of markets can afford to ask about every wallet it sees |

Run it end to end yourself: `pnpm agent:pay -- <wallet>` pays from `AGENT_SUI_KEY` and prints the digest plus the X-ray it
bought. `scripts/agent-pay-demo.ts` is about eighty lines and has no hidden state.

### Track 01, and the AI Builder note

Track 01 is covered line by line above. CALIBRE is not an AI Builder submission: it is hand-written TypeScript across eight
workspaces, and the MCP server exists so that an AI agent can *consume* CALIBRE, not because an AI assembled it.

## By the numbers

| | |
|---|---|
| **$1.78 billion** | traded in the 4,587 closed sports markets the square-money replay covers (Polymarket's own volume figure, 142 leagues) |
| **$197.6 million** | of money behind 11,975 replayed price moves, traced to 10,113 wallets |
| **790,185 bets** | scored against the price paid, across 5,740 wallets and 69,914 wallet-by-league records |
| **356,116 bets** | in the profit-blind study of 1,000 wallets behind the label test |
| **174 verdicts, and counting** | sealed on Walrus Memory mainnet before the result was known; 110 graded. The watcher seals about 1.7 an hour, so the live site's count is always ahead of this page. |
| **Every sealed verdict** | stamped with a Sui checkpoint; 137 of 174 read through Tatum's Sui gRPC gateway, the rest via Sui's public GraphQL and recorded as such |
| **Paid Tatum Starter plan** | 4M credits a month, bought 7 Nov 2026; every request priced and budgeted, 502 credits per judged move |
| **1 paid agent call** | settled on Sui mainnet: 0.01 USDC, gas price 0 |

Every figure is a plain sum over the study outputs (`scripts/scale-stats.ts`), not an estimate.

## What it does

| | |
|---|---|
| **Wallet X-ray** (`/wallet/<address>`) | Edge per bet against the price paid, with an error band; pre-game and in-play split; share of "sniping" bets at already-decided prices; a label: *proven losing record*, *proven winning record*, *mostly sniping*, *too early*, *no proven edge*. |
| **Market X-ray** (`/market/<slug>`) | The latest move of 4+ points, its biggest takers, and how much of the pushing money came from proven losers (with how much of it could be judged). A price settling at 0 or 1 is not treated as a move. |
| **Radar** (`/radar`) | Moves the watcher judged and sealed, newest first. |
| **Record** (`/record`) | Every sealed verdict with its grade once the market resolved. |
| **Chrome extension** (`apps/extension`) | The same X-ray as a panel on polymarket.com profile, event, sports and esports pages. |
| **Paid agent API** (`/api/v1/xray/<address>`) | The wallet X-ray for agents at 0.01 USDC per call over MPP on Sui. Gasless for the buyer. |
| **MCP server** (`/api/mcp`, and `apps/mcp` over stdio) | `wallet_audit` and `latest_verdicts` for Claude Code or any MCP client, over a URL or locally. No keys needed. |

Every X-ray runs live on the server, and Tatum is in each one:

- **Stamped through Tatum's Sui gRPC.** Each wallet and market X-ray says which Sui checkpoint it was read at (one gRPC query,
  2 credits, shared by all X-rays in a 15-second window).
- **Market X-rays read their fills from Tatum's Prediction Markets API** (100 credits a page, cached per market), with
  Polymarket's public Data API as the labelled fallback.
- **Wallet X-rays ask Tatum for the wallet's open-position value and markets traded** (50 credits each). That endpoint is
  currently returning 500, so the line is omitted rather than faked, and the page says why.
  The scored record itself comes from the wallet's full trade history on Polymarket's free Data API.
- **Paid agent calls are confirmed through Tatum's Sui gRPC:** the receipt carries the checkpoint that finalised the payment.

The server counts every Tatum request at its listed credit price against a daily budget and pauses Tatum after a plan error,
so the site never stops: when Tatum cannot answer, the free source takes over and the page says which one answered.
The radar, record and proof pages recall the sealed record from Walrus Memory as the page renders, so a verdict appears without anything being deployed and without any machine holding write access to this repository. If Walrus is slow or a namespace is past the 100-per-query recall ceiling, the page falls back to the last committed export and says which one you are looking at.

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

**3. The sealed forecasts so far are level with the market.** 85+ verdicts are graded on mainnet and the number keeps rising. Under the current models (v2
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
on Walruscan. The counts move as the watcher runs: see https://calibre-blush.vercel.app/proof for the live figures, which the site reads from Walrus itself rather than from a file in this repository.

## How Tatum is used

CALIBRE runs on a paid **Tatum Starter plan** (4,000,000 credits a month), bought on 7 November 2026 after the free
100,000 ran out. Tatum is not decoration here; these are the places the product stops working without it.

- **The move gate.** The watcher finds a candidate move on free data, then asks Tatum's price history whether it happened.
  If Tatum answers and its history does not show the move, the move is dropped and nothing is judged or sealed
  (`apps/worker/src/watch.ts:204`). If Tatum cannot answer, the verdict proceeds on free data and records why, so every
  verdict states the feed it stands on — see **Provenance is recorded on every verdict** below.
- **Sui gRPC gateway** (`sui-mainnet-grpc.gateway.tatum.io`), native gRPC with `@grpc/grpc-js` and `@protobuf-ts/grpc-transport`
  — Tatum's Sui JSON-RPC is deprecated and returns 404. This is the checkpoint that proves when each verdict was sealed:
  it existed before the market resolved (`packages/chain/src/suiGrpc.ts`). Every X-ray on the site is stamped the same way.
- **Prediction Markets API** (`/v4/data/prediction`): market discovery by volume and liquidity, the live price shown on a
  market X-ray, and the resolution check before grading (`packages/chain/src/prediction.ts`: priced per request, cached,
  retried, with a circuit breaker).
- **Paid agent calls** are confirmed on chain through Tatum's Sui gRPC before the X-ray is released.

**Price history needs `source=midpoint`.** Tatum's default `candlesticks` feed returns HTTP 200 with zero candles for every
Polymarket market, at every interval and range — almost certainly because it is built on the Polymarket v1 Data API retired
on 2 November 2026. `midpoint` comes off the orderbook and returns a full series. That one parameter is the difference
between the move gate working and silently never firing. It cost three days to find.

**Provenance is recorded on every verdict, not asserted.** Tatum sits on the sealing path for every judgement CALIBRE
makes, and each verdict carries the receipt for which feed answered which question:

| On every sealed verdict | Count |
|---|---|
| Sui checkpoint read through **Tatum's Sui gRPC gateway** | 137 of 174 |
| Checkpoint via Sui's public GraphQL, recorded as such, when the gateway was unreachable | 37 of 174 |
| Move checked against Tatum's price history before judging | every candidate |
| The feed that supplied the move, and the reason if it was not Tatum | every verdict |

The gate is a veto, and it is asymmetric on purpose: when Tatum's history answers and **contradicts** a candidate move, the
move is dropped and nothing is sealed. When Tatum cannot answer, CALIBRE does not invent a confirmation — it judges on the
free feed and writes down why, which is why the reasons can be counted at all:

| Why Tatum did not supply the move | Verdicts |
|---|---|
| Tatum's market `/trades` returned no fills for a market that had just moved (see the broken-endpoint list below) | 86 |
| CALIBRE's own hourly Tatum budget was already spent on the market scan | 79 |
| Tatum's history returned an empty series for that market | 9 |

That middle row is a throttle setting, not a limitation of the integration: the hourly cap was held at 18, then 24, to
protect a credit allowance shared with another builder, and the broad market scan spends it before the judging path asks for
history. It is the one number in this project tuned for cost rather than for the product.

**Spending is budgeted, not hoped for.** Every request is counted at Tatum's listed credit price — a price history request
is 200, a market lookup 100, a gRPC query 2 — against a daily cap worked out from the plan
(`packages/chain/src/credits.ts`; `scripts/tatum-cost-model.ts` measures it). Measured on the live mainnet watcher:
502 credits per judged move, about 26,000 a day. Past the daily cap the site serves free Polymarket data rather than
overspending, and says so on the page.

**Endpoints that do not work, checked against each one's own reference page on 6 November 2026:** market `/trades` returns
200 with zero rows on every documented parameter shape, including on a market taking 34 fills that minute;
`/wallets/{a}/trades`, `/value`, `/markets-traded`, `/positions` and `/top-traders` all return 500. So the fills behind a
verdict — which wallets pushed the move — come from Polymarket's free Data API, and every verdict records which source it
used and why.

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
| `apps/mcp` | The MCP tools. Served over stdio from here, and over HTTP at `/api/mcp` by `apps/web` from the same `createServer`. |
| `scripts` | The studies (`skill-persistence.ts`, `validate-labels.ts`, `square-replay.ts`), `verify.ts`, `export-site.ts`, `agent-pay-demo.ts`. |

## Run it

### Nothing to install

Everything a reviewer needs is live. No keys, no signup, no local setup.

| What | Where | What you are checking |
|---|---|---|
| The demo | https://youtu.be/-FlnLNTNff0 | 2:44, the whole thing end to end |
| A wallet X-ray | https://calibre-blush.vercel.app → paste any Polymarket profile or wallet | Runs live on the server: edge against the prices paid, error band, sniping share, and the Sui checkpoint it was read at |
| A market X-ray | paste a Polymarket market or event link | The latest move, who pushed it, the square-money share and how much of it could be judged |
| The sealed record | https://calibre-blush.vercel.app/record | Every verdict with its grade. Read from Walrus when the page renders, so it moves while you watch |
| The proof | https://calibre-blush.vercel.app/proof | Namespace counts, blob links on Walruscan, and the checkpoint source for each verdict |
| The method and its limits | https://calibre-blush.vercel.app/method | The label test, the replay, and where the evidence stops |

No wallet to hand? The landing page has a **Try a sample wallet** link. Note that a wallet's label is not fixed: it is
recomputed from that wallet's newest 1,000 trades every time, so one labelled a proven winner last week can read *too early*
today once older bets fall out of the window. That is the measurement behaving correctly, not drifting.

**The MCP server** takes one line and no key:

```
claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp
```

It is plain JSON-RPC over HTTP, so nothing Anthropic-specific is required — Cursor, VS Code, Windsurf, Cline and Goose all
speak it, and `curl` works too:

```bash
curl -s -X POST https://calibre-blush.vercel.app/api/mcp   -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream'   -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

**The Chrome extension**: download https://calibre-blush.vercel.app/calibre-extension.zip, unzip it, then
`chrome://extensions` → Developer mode → Load unpacked. Open any polymarket.com profile, market or game page.

### Rebuild the proof yourself

The strongest check, and the one that does not trust this repository: rebuild the record from Walrus Memory alone.

```bash
pnpm install
cp .env.example .env     # add MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID and MEMWAL_SERVER_URL
pnpm verify              # recalls every verdict and outcome from Walrus, checks each outcome has its verdict,
                         # rewrites docs/PROOF.md and prints the Sui checkpoint it read through Tatum
```

Nothing in `docs/PROOF.md` comes from a local database; it is rebuilt from the memories on mainnet each time.

### Run the code

```bash
pnpm install
pnpm test                         # 292 tests
pnpm --filter @calibre/web dev    # the site on http://localhost:3000, no keys needed
```

With keys in `.env` (copy `.env.example`: a Tatum API key, a Walrus Memory delegate key and account ID):

```bash
pnpm verify          # rebuild the proof from Walrus Memory
pnpm watch           # judge and seal live moves
pnpm grade           # grade resolved verdicts
pnpm export:site     # refresh apps/web/data from Walrus
```

Extension: download the zip from https://calibre-blush.vercel.app/extension and load it unpacked, or build it with
`pnpm --filter @calibre/extension build` and load `apps/extension/dist`.

MCP, hosted, nothing to install:

```
claude mcp add --transport http calibre https://calibre-blush.vercel.app/api/mcp
```

Or locally over stdio: `claude mcp add calibre -- pnpm --silent exec tsx apps/mcp/src/index.ts`.

## Limits

- Edge is measured against the price paid and ignores fees and bet size. Wallets trade the same events, so intervals are optimistic.
- The wallet X-ray reads a wallet's newest 1,000 trades; a long history is judged on its recent part.
- The square-money result is p = 0.073. It is early evidence, and the product says so wherever it appears.
- The sealed wallet records are a subset: 337 and rising on Walrus, while the watcher labels takers from a larger local index (5,740 wallets) that is not all sealed.
