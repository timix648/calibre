# CALIBRE build plan

Deadline: **10 Nov 2026, 17:00 UTC** (submit by 12:00 UTC). Product: "Is this move real?" (docs/adr/0001).
Evidence: docs/FINDINGS.md (skill against price persists for active traders; the leaderboard mostly misses it).

## Structure

```
apps/worker/          Node worker: index, watch, grade (milestone 1)
apps/web/             Next.js 16 site: feed, market, wallet, learning, proof (milestone 2)
packages/core/        pure scoring: edge, picks, attribution, moves, blend   (done, tested)
packages/chain/       Tatum Prediction client (budgeted) + Sui gRPC via Tatum (done)
packages/memory/      envelopes + Walrus Memory store (done)
scripts/              spikes, study, verify
docs/                 ADRs, FINDINGS, PROOF, this plan
```

## Hard rules
1. **Tatum credits are scarce** (100k lifetime per key; the current key is the second one). Every Tatum Prediction
   client must be created with `callBudget: Number(process.env.TATUM_CALL_BUDGET ?? 1500)` and
   `budgetFile: ".cache/tatum-calls.json"`, plus `cacheDir: ".cache/tatum"`. Never raise the budget in code.
2. **Bulk history** (wallet trade histories for the skill index) comes from Polymarket's free public API via
   `scripts/public-source.ts`, disclosed in the README. **Live market data** (events, prices, candles, trades,
   resolutions) and **all Sui reads** go through Tatum. Never mock a sponsor API in runtime code.
3. Walrus Memory on **mainnet** via `WalrusMemoryStore` (`packages/memory`), envelopes via `encode()`; namespaces
   from `NAMESPACES`. Write in bulk (≤20 per request). Writes take 6 to 25 s, so never block a web request on them.
4. Pure logic goes in `packages/core` with vitest tests. `pnpm typecheck` and `pnpm test` must pass before every commit.
5. Commit after each task with a clear message ending in `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   (the user's attribution line). Never commit `.env`, `.cache/` or `research/`. Do not push.
6. No placeholder text, TODO comments or AI-assistant notes in committed files.

## Milestone 1: the engine (worker + memory), CLI-verifiable

**M1.1 Wallet skill index** `apps/worker/src/index-wallets.ts`
- Wallets: the 65 studied (`docs/skill-persistence-results.json` rows + `.cache/active-sample.json`) plus takers of
  recent closed SPORTS markets (free public API).
- Per wallet and per league: `priceEdge` (half-life 60 days) on `onePickPerMarket(tradesToPicks(...))`.
  Resolutions: cached Tatum responses, then Gamma via `prefetchResolutions`.
- Output `.cache/index/wallets.json` `{ wallet, league, edge, se, z, n, effN, updatedAt }[]` and, for wallets with
  n ≥ 30, a versioned `wallet` envelope in `calibre-wallets`, e.g.
  `[cal1|wallet|0xabc:nba|v1] Wallet 0xabc… has +6.1 pts edge on NBA over 212 bets (z 2.4): likely skill || {json}`.
  The version increments only when the edge changes by ≥0.5 pts.
- Verdict wording, shared helper in core: z ≥ 2 → "skill"; z ≤ −2 → "negative edge"; n < 30 → "too early"; else "luck / unproven".

**M1.2 Move watcher** `apps/worker/src/watch.ts` (run once per invocation; a loop flag for the demo)
- Tatum: `events(status=active, category=SPORTS, sort=volume_desc, limit=10)` and `sort=endingSoon` (limit 10).
- For each market, `marketHistory(interval=5m, last 2h)`, then `latestMove(minJump 0.05, 60 min)`.
- On a move: `marketTrades` pages back to the move start (max 5 pages), then `aggregateFlows` with `skillOf` from
  the index (league from the event slug), then `judgeMove`.
- Seal: latest checkpoint via `tatumSuiClient(...).ledgerService.getCheckpoint`, then a `verdict` envelope to
  `calibre-verdicts` containing market, question, move, label, sharpShare, forecast, top wallets with their
  edge/z and memory blob IDs, and checkpoint. Do not re-judge the same market within 2 hours.

**M1.3 Grader** `apps/worker/src/grade.ts`
- For sealed verdicts whose market has resolved (Tatum `market(id).resolution`): Brier of CALIBRE's forecast vs the
  market price after the move, per label. Write an `outcome` envelope to `calibre-outcomes`.
- Append the resolved bets of wallets seen in verdicts to their evidence and re-version their `wallet` memory
  when it changes. This is the visible learning loop.

**M1.4 Verify** `scripts/verify.ts`
- Lists memories per namespace (SDK `listMemories`), rebuilds verdict and outcome stats from Walrus alone, prints
  the latest Sui checkpoint via Tatum gRPC and the Tatum calls used and remaining. Writes `docs/PROOF.md` with counts and
  sample blob IDs linked to `https://walruscan.com/mainnet/blob/<id>`.

**Done when:** index built; at least 1 real verdict sealed on mainnet; 50+ memories on mainnet; grader runs; verify
prints consistent numbers; all tests pass; Tatum calls used reported.

## Milestone 2: the site (after the milestone 1 review)
Next.js 16 in `apps/web`, reading the index and Walrus. Pages: Landing (headline finding + chart), Live moves feed,
Market detail (who moved it, verdict, receipt with blob links), Wallet page (paste any address: edge with error
bars and verdict), Learning (backtest charts from FINDINGS + live grades, memory on/off), Proof. Plus an MCP tool
`is_move_real(market)` and `wallet_skill(address)`. Deploy on Vercel with judge access and no sign-up.

## Milestone 3: submission
README rewrite, blog post, 2:30 video script, X thread, form answers, red-team gate (blueprint section 2.3).
