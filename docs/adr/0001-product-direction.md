# ADR 0001: Product direction, "Is this move real?"

Status: accepted, 2 Nov 2026

## Context
Scoring forecasters and showing a leaderboard is a well-covered idea. What prediction-market users lack is an
answer, at the moment a price jumps, to one question: is this informed money or noise?

Tatum's Prediction Markets API exposes, for every market, its trades with the taker wallet, price, size and side;
for every wallet, its trade history; and for every market, its resolution. That is enough to learn, per wallet and
per category, whether a wallet's trades carry information beyond the price it paid.

## Decision
CALIBRE watches markets and, when a price moves:
1. Pulls the trades behind the move and groups them by taker wallet.
2. Recalls each wallet's skill memory (Brier skill score against the price paid, per category, shrunk for sample size).
3. Labels the move (sharp-led, mixed, noise) and produces a skill-weighted forecast (logit pooling around the price).
4. Seals the verdict in Walrus Memory with the Sui checkpoint read through Tatum gRPC, before the outcome is known.
5. Grades the verdict when the market resolves, and updates the wallet skill memories.

The learning claim is tested, not asserted: on the same moves, the forecast with wallet memory is compared with
the forecast without it (equal weights) and with the raw price.

## Consequences
- Walrus Memory holds the learned state (wallet skill versions, sealed verdicts, outcomes); Postgres is only a cache.
- All market data comes from Tatum; all Sui reads go through Tatum gRPC.
- If wallet skill does not beat the price on liquid markets, we report that honestly and show where it does help.
