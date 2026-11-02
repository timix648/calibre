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
