# Day-0 spikes (2 Nov 2026)

All three external dependencies work on mainnet with real data.

## Tatum Sui gRPC: works
- Host `sui-mainnet-grpc.gateway.tatum.io:443`, API key as `x-api-key` call metadata.
- The gateway speaks **native gRPC**, not gRPC-web. The SDK's default transport fails with
  `unexpected response content type: application/grpc`. Fix: `@protobuf-ts/grpc-transport` + `@grpc/grpc-js`
  (`packages/chain/src/suiGrpc.ts`).
- Tatum's Sui **JSON-RPC** gateway returns 404 on this key (Sui has deprecated JSON-RPC). Use gRPC only.
- gRPC has no event search. For one-off event lookups we used Sui's public GraphQL (`scripts/find-account.ts`).

## Walrus Memory (mainnet): works
- `rememberAndWait` took ~25 s; `recall` with `scoringWeights` returned the memory (distance 0.27).
- First memory: blob `hCa7UeJ7zFQt7modIOGJL50IS-NtieXWbJltcjboaro` (namespace `dev-calibre-spike`).
- Relayer `/config` exposes `packageId` and `registryId`; account ID found from `DelegateKeyAdded` events.
- SDK 0.1.12 also has `listMemories`, `listNamespaces`, `rememberBulkAndWait`, `analyzeAndWait`, `restore`.
  `RecallOptions.sort` gives newest-wins ordering (and disables `scoringWeights`), useful for versioned `cred` memories.

## Tatum Prediction Markets API: works on the free key
- `/events`: `sort` must be one of `volume_desc | liquidity_desc | endingSoon | newest`; events list market IDs only.
  Status filter `resolved` returns `closed` events; use `status=closed&sort=newest` for recent ones.
- `/markets/{conditionId}`: `resolution: { outcome, resolvedAt, source }` and `outcomes[{ name, price }]`.
  **Resolution detection is solved.** Sports outcomes are often team names, not YES/NO.
- `/top-traders?category=SPORTS`: no `period` parameter. Returns `proxyWallet`, `userName`, `vol`, `pnl`.
- `/wallets/{addr}/trades`: `conditionId`, `side` (BUY/SELL), `price`, `size`, `outcome`, `outcomeIndex`,
  `timestamp` (seconds), `slug` (e.g. `nba-okc-cle-2026-11-02-total-227pt5`, so league and market type come from the slug),
  `transactionHash` (Polygon).
- `/markets?...` returned an empty list with these filters; go through events or wallet trades instead.

## Design consequence for the backtest
A trade's own price is the market price at the moment of the pick, so `pMkt = trade price` and
`pSrc = impliedProb(outcome bought, price)`. No price-history call is needed per pick; a source has positive
skill exactly when its bought outcomes win more often than their prices implied. Map `outcomeIndex 0` to YES and
`1` to NO, and compare the bought outcome's name with `resolution.outcome`.

# Milestone 1 notes (3 Nov 2026)

## Tatum Prediction API: what the live watcher found
- `sort=endingSoon` lists long-finished events first (events from March 2026 still carry `status: active`), so it is
  useless for finding games in play. The watcher lists `volume_desc` and `liquidity_desc` (`limit=100` is accepted) and
  keeps events whose `closeTime` falls between 8 hours ago and 36 hours ahead (`selectCandidates` in `packages/core`).
- An event's slug is `source.platformId` (e.g. `cs2-mglz-hero-2026-11-02`); markets carry no slug. League is its first segment.
- Markets inside an active event can already be `resolved` (for example "Map 1 Winner"). Their history and trades
  endpoints return empty arrays, so the watcher spends one history call to find that out and moves on.
- `outcomes[0]` is YES (`chain.tokenIds.yes`); sports markets name it after the team. Grading maps the resolution name
  to YES when it equals `outcomes[0].name`.
- `PredictionClient.market()` used to make two calls for an uncached open market and never cached the resolved copy;
  it now makes one call and keeps the resolved copy forever. `marketTradesSince` pages `/trades` with `pagination.cursor`.

## Polymarket public data
- Data API v2 renamed the market filter: `/v2/trades?market=` now returns 400, use `condition=`.
- Gamma `/markets?closed=true&order=closedTime&ascending=false` pages 100 at a time and lists recent closes first;
  game-winner markets are the ones whose slug ends in a date.
- Gamma answers `[]` for markets that are not closed yet, and the file cache kept that forever. `prefetchResolutions`
  takes `maxEmptyAgeMs` to look such markets up again, and `publicWalletHistory` takes `fresh` to skip cached pages.

## Walrus Memory and Sui
- `recall` returns at most 100 memories per query; `listMemories` pages the whole inventory (metadata only, no text).
- Latest checkpoint: `ledgerService.getCheckpoint` with `readMask.paths = ["sequence_number", "digest", "summary.timestamp"]`
  returns the sequence number, digest and certification time in about a second.
- `pnpm --filter` runs scripts inside the package directory, so the worker moves to the repository root on start
  (`apps/worker/src/lib/root.ts`) and every relative path (`.env`, `.cache`, `docs`) keeps working.

# Tatum outage and the labelled fallback (3 Nov 2026)

From about 08:00 UTC on 3 Nov, Tatum's Prediction API answered `/markets/{id}/trades` and `/markets/{id}/history` with empty
arrays and `/wallets/{addr}/trades` with HTTP 500, while `/events`, `/markets/{id}` and `/markets/{id}/price` kept working
(Tatum acknowledged the report publicly). Election Day and the midterm markets fall inside the outage, so the watcher
keeps Tatum as the primary source and falls back to Polymarket's free public API when Tatum has nothing.

## How the watcher behaves
- Per market it asks Tatum `history` first. An empty result for an active market, or a failure (the client retries a 5xx
  once in the watcher), switches that market to Polymarket public data and opens a **circuit breaker for 60 minutes**
  (`.cache/worker/tatum-breaker.json`), so a broken endpoint costs one credit per market per hour, not one per pass.
  Sub-markets that are already resolved return empty too; they trip the breaker as well, which also saves credits.
- Public data: Data API v2 `https://data-api.polymarket.com/v2/trades?condition=<conditionId>&limit=500` with cursor paging
  (`pagination.next_cursor`; snake_case fields). `outcome_index` 0 maps to YES and 1 to NO, `side` BUY/SELL to buy/sell, and
  `timestamp` is in seconds. The price series is the YES price of the last fill in each 5-minute bucket
  (`priceSeriesFromTrades` in `packages/core/src/fallback.ts`). The same fills, filtered to the move, feed the attribution.
- CLOB `https://clob.polymarket.com/prices-history?market=<YES token id>&interval=1d&fidelity=5` was checked and answers
  with `{ history: [{ t, p }] }` roughly every 5 minutes. It is not used: it needs the YES token id from Tatum's
  `/markets/{id}` (one more credit per market) and the fills are needed for attribution anyway.
- The live price is always read from Tatum `/markets/{id}/price` (one call per judged market). The verdict is judged
  against its `midPrice`: if the mid has retraced below the minimum jump, or sits within 3 points of 0 or 1 (a market that is
  settling), the move is dropped. So Tatum stays on the critical path even when the history came from the public API.
- Every verdict envelope (`data.source`, `data.fallbackReason`) and every ledger row (`source`, `fallbackReason`) says
  `tatum` or `polymarket-public`; a public-sourced summary ends with `Data: Polymarket public API (<reason>)`. Verdicts sealed
  before the fallback existed have no `source` field and are read as Tatum.
- Credit use: the watcher counts every Tatum call it makes (`.cache/worker/tatum-hourly.json`) and, once the last hour holds
  `--tatum-hourly` (default 50) minus 10 reserved for judging, uses public data with the reason "Tatum hourly call cap
  reached". Event lists are kept on disk for `--discover-every` minutes (default 60).

# Elections coverage (3 Nov 2026)

## Discovery
- Tatum `events(status=active, category=POLITICS, sort=volume_desc, limit=100)` is a mix of everything political (2028
  nominees, Iran, Ukraine). The event `category` is a free-text label ("United States", "Texas Senate"), so it cannot be used
  to pick midterm races. The event `tags` can: every 2026 midterm event carries a tag containing `midterm` (`midterms`,
  `texas-midterm`, `referendums-midterms`). `isMidtermEvent` keeps active events with such a tag that close within 14 days
  (20 events on 3 Nov: control of the House and Senate, Balance of Power, each Senate race, governors, the California ballot measure).
- Midterm markets are filed under the category `politics` (`league: "politics"` in candidates, verdicts and wallet rows),
  not under the first word of the slug (`will`).
- Tatum lists an event's markets in order of importance, so the watcher takes the first two of each event, busiest event
  first (`selectMidtermCandidates`). Event lists are kept on disk (`.cache/worker/events-*.json`) for 60 minutes in the
  watcher and 6 hours in the indexer.

## Politics wallet segment
- `pnpm index` ranks the markets of the midterm events by lifetime volume with Gamma (`/events?slug=`, free), takes the top 30,
  and samples the takers of each from the public `/v2/trades?condition=` (500 fills each). Wallets seen in at least two of the
  30 markets, most markets first, capped at 120, are scored: 4,426 takers, 985 in two or more markets, 120 taken, 98 with at least one resolved politics bet.
- A bet counts as politics when its Polymarket **event** carries the `politics` tag (`publicEventTags`: Gamma
  `/events?slug=a&slug=b…`, 25 per request, cached; closed events keep their tags, closed *markets* do not, so the lookup is per
  event). This is applied to resolved bets only, through the `leagueFor` hook of `tradesToPicks`.
- Same edge as the sports rows: `priceEdge` with a 60-day half-life, one pick per market. Rows with n >= 30 are ranked by |z|
  (cap 60) and written as `wallet` envelopes with key `<wallet>:politics` to `calibre-wallets`.
- The grader's learning loop now replaces wallet rows by (wallet, league) key and re-scores a wallet's politics bets with the
  same tag lookup, so a politics verdict re-versions politics memories without touching the wallet's sports rows.
- Most midterm takers are new accounts: 98 wallets have a resolved politics bet and only 26 have n >= 30. The politics skill
  signal is therefore thin (1 wallet with z >= 2, 4 with z <= -2), and a politics verdict will often read "noise" because few
  of the traders in a move are in the index.

## Running the loop through election night
`pnpm watch --loop 10 --min-jump 0.04` scans 16 sports and 14 midterm markets every 10 minutes. Tatum calls per hour while the
history endpoint is still broken: about 30 (each market is re-probed once an hour when its breaker expires), 3 for event lists
(sports volume, sports liquidity, politics, each kept 60 minutes), and 2 per judged market (market and live price), so roughly
40 to 45 an hour with a handful of verdicts. The watcher stops asking Tatum for history and trades once 40 calls are on the
hourly meter (`--tatum-hourly 50` minus 10 reserved for judging), so it cannot exceed about 50 an hour even after Tatum
recovers. Run `pnpm grade` every hour or two once markets resolve, and `pnpm verify` to refresh `docs/PROOF.md`.

First live run (3 Nov, 11:45 UTC, `--min-jump 0.04`): all 30 markets were served from Polymarket public data (Tatum history
empty for every one), 3 moves were found, one was skipped because the market had settled (live mid 0%), two verdicts were sealed
and `pnpm verify` rebuilt both from Walrus. No midterm market had moved 4 points in the last hour.

# Review fixes: in-play edge, forecast overreach, junk categories (3 Nov 2026)

## Wallet edge no longer counts in-play trades
A review found wallets with absurd edges (+41 pts at z 9 on CS2). They trade live games, often seconds before the outcome is
known; that is latency, not forecasting skill. `tradesToPicks` now drops a trade when
- it was placed at or after the market's start, or
- no start is known and it was placed in the last 3 hours before the market closed, or
- its price is 0.97 or above, or 0.03 or below.

Start and close come from the Gamma row that `prefetchResolutions` already caches with each resolution (the cache keeps every field,
so no new requests were needed). What Gamma returns for closed markets in the cache (38,738 rows): `gameStartTime` on 75%
(`2026-10-15 02:30:00+00`), `eventStartTime` on 20% (`2026-10-15T02:30:00Z`), neither on 13% (weather, politics and price
ladders). `startDate` is when the market was listed, not when play began, so it is not used. Start = `gameStartTime`, else
`eventStartTime`; close = the earlier of `endDate` and `closedTime`. Markets resolved from the Tatum cache take the start from the
Gamma row when it is cached and Tatum's `closeTime` otherwise.

Rebuilt index (`pnpm index --reuse`, all caches reused, no Tatum calls): rows 4,095 to 1,527, rows with n >= 30 from 423 to 141,
rows with z >= 2 from 61 (35 wallets) to 6 (6 wallets), z <= -2 from 15 to 7. The top edge fell from +41.0 pts (z 9.1, CS2) to
+16.5 pts (z 1.8). Wallets such as `0xef1eee` (MLB, 261 bets) and `0x4738e7` (NBA, 177 bets) placed 995 and 978 of their last 1,000
trades after the game had started, so nothing is left to score. Of the 126 wallet memories sealed earlier, 89 changed by 0.5 pts
or more and were re-versioned; 28 had no scorable bet left and were re-versioned as zero-bet "too early" memories, so the newest
version of those keys no longer claims an edge (Walrus is append-only: the old versions stay, but the highest version wins).
A key that already has a memory is re-versioned when its edge changes even if the wallet fell below 30 bets; a first memory still
needs 30 bets. `pnpm index --refresh-only` re-versions existing memories without writing first memories.

## Conservative forecast (model v2)
A sealed verdict forecast 65% when the price after the move was 32.5% and only 3% of the aligned money came from wallets with a
learned edge. Cause: one skilled wallet was weighted by its share of *skilled* money (all of it) with alpha 1. Model v2:
- each wallet's shrunk edge is capped at 0.08;
- skilled wallets are weighted by their share of the *total* flow in the move;
- `judgeMove` blends with alpha 0.5;
- the forecast is held within 0.10 of the price after the move.

New verdicts carry `model: "v2"`. The two verdicts sealed before the change have no `model` field and are read as `v1`; Walrus is
append-only, so they were not re-sealed or deleted. `pnpm verify` and `docs/PROOF.md` show the model of every verdict, and `pnpm grade`
and `pnpm verify` score v1 and v2 verdicts in separate tables (outcomes carry the model of the verdict they grade).

## Leagues are a whitelist
The league used to be the first word of a market slug, so `highest-temperature-in-...` became the league `HIGHEST` and
`will-...` became `WILL`. `leagueOf` in `packages/core/src/leagues.ts` now returns a prefix only if it is on a curated list of
sports and esports leagues (NBA, NFL, MLB, NHL, WNBA, college football and basketball, the football leagues, ATP/WTA/ITF, cricket,
overseas basketball, CS2, LoL, Valorant, Dota 2, UFC and so on); the list was built from the prefixes of the wallets in the index.
Short prefixes that double as words or countries (`col`, `chi`, `aus`, `pol`, `den`, `fif`, `ow`, ...) count only when the slug
carries a game date. Everything else is `other`; politics keeps its own category (event tag). `other` rows stay in the index for
transparency, are never used as a skill lookup for a market, and never get a wallet memory.
