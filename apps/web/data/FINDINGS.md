# Findings: the labels predict what a wallet does next; the leaderboard does not

## Label validation, 1,000 profit-blind wallets (4 Nov 2026, the headline)
Question: does the label a wallet would have had from its **older** bets say anything about its **newer** bets? Each wallet's bets
are split at the middle; the older half is what the X-ray would have known, the newer half is what happened next. Wallets are the
profit-blind sample of the wide study (983 with a result line), not picked for profit. Labels use the live rules: proven losing
record = z of -2 or lower over 30+ bets; proven winning record = z of 2 or more over 100+ bets; too early = under 30 bets; else
no proven edge. Edge is points won above the price paid, per bet. Intervals are percentile bootstrap 95% over wallets (2,000
resamples, fixed seed). Full tables, by phase: `docs/LABEL_VALIDATION.md`; code: `scripts/validate-labels.ts`.

| Label from the older half | Wallets | Next-half edge, pts per bet | 95% interval | Negative next half |
|---|---:|---:|---|---:|
| **proven losing record** | 57 | **-3.8** | -5.1 to -2.4 | 81% (46/57) |
| **proven winning record** (rare, strict) | 40 | **+2.2** | +0.5 to +4.1 | 38% (15/40) |
| no proven edge | 801 | -1.0 | -1.3 to -0.7 | 60% |
| all wallets | 983 | -1.1 | -1.5 to -0.7 | 61% |

- A proven losing record is the strongest label: those wallets lost again by about 4 points per bet, against about 1 for everyone.
- A proven winning record is rare and the effect is modest: those wallets stayed ahead by about 2 points per bet, and 38% of them had a
  negative next half.
- Both results are mostly driven by in-play bets. Losing label: in-play -3.5 [-5.1, -2.0] (47 wallets), pre-game -1.2 [-3.8, +1.6] (21
  wallets). Winning label: in-play +0.9 [-1.2, +3.1] (15 wallets), pre-game -1.0 [-3.1, +1.3] (11 wallets). Split by phase the samples are
  small and the winning label is not significant in either, so it is weaker evidence than the losing label.
- Caveats: older and newer halves of one wallet share its style, so this is not a clean out-of-sample trading test; wallets trade the
  same events, so the intervals are optimistic; edge is measured against the price paid and ignores fees and bet size.

## Square-money replay (4 Nov 2026): early evidence, not conclusive
Question: when a market moves mostly because proven losers pushed it, does following the move pay worse? `scripts/square-replay.ts`
replays 4,355 real moves of 6 points or more within 60 minutes, in 1,662 closed sports markets. For each move the six biggest takers
are labeled using **only bets that resolved before the move**. The follow edge is the final result minus the price at the end of the
move, in the move's direction (negative: the move overshot).

| Moves pushed by | Moves | Follow edge, pts [95% CI] |
|---|---:|---|
| proven losers (50% or more of the labeled flow) | 176 | -3.4 [-9.7, +2.7] |
| mixed | 226 | +1.4 [-4.2, +7.1] |
| no proven losers (clean) | 1,357 | +0.3 [-1.9, +2.6] |
| all labeled moves | 1,759 | +0.1 [-1.9, +2.1] |

- Difference, loser-driven minus clean: **-3.8 pts**, one-sided permutation p about 0.14. The interval for loser-driven moves spans
  zero, so this is **early evidence, not conclusive**. Followers of loser-driven moves did worse in the replay; that is all it says.
- A longer replay (6,000 markets) is running. CALIBRE shows square money as a caution signal and never tells anyone to trade against it.

---

## Earlier: wide study of 1,000 wallets, best and worst thirds (3 Nov 2026)
Same method as below (`scripts/wide-study.sh`, already-decided bets at ≥0.97/≤0.03 excluded), with 1,000 wallets sampled
without regard to profit from 2,000 random sports markets, plus the 25 top earners. Full report: `research/wide-study`
on the build machine; summary:

| Bets counted, profit-blind wallets | Wallets | Rank correlation, older vs newer edge | p | Best third by older edge: newer edge | Worst third: newer edge |
|---|---|---|---|---|---|
| All | 983 | **0.17** | <0.0001 | −0.2 pts | **−2.1 pts** |
| All, 100+ bets | 840 | **0.21** | <0.0001 | +0.3 pts | **−2.1 pts** |
| Pre-game, 100+ bets | 403 | 0.07 | 0.09 | −0.8 pts | −1.9 pts |
| In-play, 100+ bets | 683 | 0.14 | <0.0001 | −0.5 pts | −2.0 pts |
| Top earners (all) | 23 | −0.04 | 0.57 | −1.1 pts | +0.4 pts |

- With enough wallets, track records do persist, but almost entirely on the **losing** side: wallets in the best third
  roughly break even afterwards, while wallets in the worst third keep losing about 2 points per bet.
- No third showed a reliably **positive** future edge. The stricter label above (z of 2 or more over 100+ bets) does show a modest one, so
  a rare proven winning record carries some information, while ranking wallets by raw edge does not.
- The profit leaderboard carries no persistent signal.
- The 40-wallet study below lacked the power to see this; it is kept as the record of how the method was corrected.

---

# Earlier: apparent trader "skill" does not persist once you remove already-decided bets (40 wallets)

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
