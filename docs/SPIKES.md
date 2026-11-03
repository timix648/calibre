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
