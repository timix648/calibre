# Finding: trader skill is real and persistent, and the leaderboard mostly misses it

Study run 2–3 Nov 2026 with `scripts/skill-persistence.ts` (`SOURCE=public SAMPLE=active TRADES=1000`).

## Question
Does a Polymarket sports trader's **edge against the price they paid** in their older bets predict their edge in
their newer bets? If yes, weighting a market move by who traded it carries real information.

## Method
- **Edge** = mean of (won − price paid), one pick per wallet per market, sells scored as the opposite side
  (`packages/core/src/edge.ts`, `picks.ts`). Under "prices are fair", edge has standard error √(Σ p(1−p))/n.
- Each wallet's last ≤1,000 trades are split chronologically into an older and a newer half.
- **Two samples:**
  - *Top earners:* 25 wallets from the SPORTS profit leaderboard. Biased: chosen for recent profit.
  - *Profit-blind:* 40 wallets active in at least 3 of 120 random sports markets, chosen without looking at profit.
- Trades from Polymarket's public Data API (v1, then v2 after v1 was retired on 3 Nov), resolutions from cached Tatum
  Prediction API responses and Polymarket's Gamma API. ~25,900 scored bets in total.
- Significance by permutation test on the rank correlation (5,000 shuffles).

## Results

| Sample | Wallets | Rank correlation, older vs newer edge | p | Newer edge, best third by older edge | Newer edge, worst third |
|---|---|---|---|---|---|
| **Profit-blind** | 40 | **0.41** | **≈0.005** | **+3.2 pts** | **−0.9 pts** |
| Profit-blind, 300+ bets | 31 | **0.56** | **≈0.001** | **+6.3 pts** | 0.0 pts |
| Top earners (biased) | 23 | 0.10 | ≈0.33 | +4.1 pts | +3.8 pts |

- Of the 7 profit-blind wallets whose older edge was clearly beyond luck (z ≥ 2), **6 stayed positive**, averaging
  **+8.6 points** of edge in their newer bets.
- Among top earners, past edge barely predicts future edge: the leaderboard ranks recent profit, which is mostly luck
  plus size, not repeatable skill.

## What it means for CALIBRE
Measured correctly (edge against price, with error bars, out of sample), some traders have real, persistent skill.
That is the signal CALIBRE uses to judge whether a market move is informed money or noise, and it is not what
profit leaderboards show.

## Caveats
- Wallets trade the same seasons and events, so they are not fully independent; the p-values are optimistic.
- 40 wallets, one split per wallet. The live product keeps testing this: every verdict is sealed before the outcome
  and graded after it.
- The implied-belief mapping only affects the Brier-based helpers, not edge.
