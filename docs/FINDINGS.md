# Finding: on Polymarket sports, apparent trader "skill" does not persist once you remove already-decided bets

Studies run 2–3 Nov 2026 with `scripts/skill-persistence.ts` (`SOURCE=public SAMPLE=active TRADES=1000`, plus `PHASE`).
This file was corrected on 3 Nov after a stricter test; the first version reported persistence that came from an artefact.

## Question
Does a Polymarket sports trader's **edge against the price they paid** in their older bets predict their edge in
their newer bets? If yes, weighting a market move by who traded it carries real information.

## Method
- **Edge** = mean of (won − price paid), one pick per wallet per market, sells scored as the opposite side
  (`packages/core/src/edge.ts`, `picks.ts`). Under "prices are fair", edge has standard error √(Σ p(1−p))/n.
- Each wallet's last ≤1,000 trades are split chronologically into an older and a newer half.
- **Two samples:** 25 top earners from the SPORTS profit leaderboard (biased: chosen for recent profit), and 40
  profit-blind wallets active in at least 3 of 120 random sports markets (chosen without looking at profit).
- **Bet phases** (`PHASE`): *pre-game* (placed before the game started, from Gamma `gameStartTime` / `eventStartTime`),
  *in-play* (placed after it started), *all*. Bets at prices ≥0.97 or ≤0.03, where the outcome was effectively
  decided, are excluded in the corrected runs.
- Trades from Polymarket's public Data API, resolutions and start times from Gamma. Significance by permutation test on
  the rank correlation (5,000 shuffles).

## Results (profit-blind sample unless noted)

| Bets counted | Wallets | Rank correlation, older vs newer edge | p |
|---|---|---|---|
| All, **including** already-decided bets (first run) | 40 | 0.41 | ≈0.005 |
| All, already-decided bets excluded | 40 | 0.12 | ≈0.23 |
| Pre-game only | 30 | 0.03 | ≈0.45 |
| In-play only | 40 | −0.10 | ≈0.73 |
| Top earners, all, already-decided excluded | 23 | −0.07 | ≈0.63 |

- The persistence in the first run came from wallets that repeatedly **buy outcomes that are already decided** (for
  example at 98¢). That strategy earns a small, steady edge, so it looks persistent, but it is not forecasting and it
  says nothing about whether a market move is informed.
- Once those bets are removed, no group of wallets shows edge that carries over from older to newer bets, pre-game
  or in-play. Few wallets clear z ≥ 2 at all (1 of 40 profit-blind wallets on all phases).
- The profit leaderboard is no better: past edge of top earners does not predict their future edge.

## What it means
- With the bet counts individual wallets have (a few hundred), a wallet's measured edge is dominated by luck. Most
  "smart money" a copy-trader would follow is either luck or already-decided-bet sniping.
- CALIBRE therefore must not label a move "sharp money" from wallet history alone. Its honest job is to show who moved
  a market, what each wallet's record really is once sniping and luck are accounted for, and to say plainly when
  nobody behind a move has a proven edge.

## Caveats
- 65 wallets, one split per wallet; wallets trade the same events, so they are not independent.
- Real skill smaller than about ±3 points per bet cannot be detected per wallet at these sample sizes; it may exist
  and be invisible. Cohort-level tests with many more wallets could detect it.
- Raw rows of the first run: `docs/skill-persistence-results.json`.
