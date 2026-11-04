# Label validation

Question: does the X-ray label a wallet would have had from its older bets say anything about how it does on its newer bets?

## Method

- Source: the per-wallet lines of the skill-persistence study logs (wide-all.log, wide-pregame.log, wide-inplay.log). Each wallet's bets are split at the middle: the older half is what the X-ray would have known, the newer half is what happened next.
- Wallets: the profit-blind sample only (wallets drawn from the same markets, not picked for profit).
- Label from the older half, with the rules of the live X-ray: proven losing record = z <= -2 over at least 30 bets; proven winning record = z >= 2 over at least 100 bets; too early = fewer than 30 bets; otherwise no proven edge. "Mostly sniping" cannot be derived from the logs and is left out.
- Edge: points won above the price paid, per bet, on one pick per market. Mean newer-half edge comes with a percentile bootstrap 95% interval (2,000 resamples over wallets, fixed seed). A wallet counts once, whatever its size.
- n for the label is floor(picks / 2), the size of the older half.

## All bets

983 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 57 | -9.1 | -3.8 | -5.1 to -2.4 | 81% (46/57) |
| proven winning record | 40 | +8.3 | +2.2 | +0.5 to +4.1 | 38% (15/40) |
| no proven edge | 801 | +0.2 | -1.0 | -1.3 to -0.7 | 60% (484/801) |
| too early | 85 | +2.7 | -1.9 | -4.3 to +1.0 | 60% (51/85) |
| all wallets | 983 | +0.2 | -1.1 | -1.5 to -0.7 | 61% (596/983) |

## Pre-game bets

823 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 21 | -10.6 | -1.2 | -3.8 to +1.6 | 71% (15/21) |
| proven winning record | 11 | +7.3 | -1.0 | -3.1 to +1.3 | 55% (6/11) |
| no proven edge | 491 | +0.5 | -1.2 | -1.7 to -0.7 | 60% (296/491) |
| too early | 300 | -1.0 | -1.9 | -3.3 to -0.2 | 60% (180/300) |
| all wallets | 823 | -0.2 | -1.4 | -2.0 to -0.8 | 60% (497/823) |

## In-play bets

940 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 47 | -9.7 | -3.5 | -5.1 to -2.0 | 72% (34/47) |
| proven winning record | 15 | +8.6 | +0.9 | -1.2 to +3.1 | 40% (6/15) |
| no proven edge | 707 | -0.1 | -1.1 | -1.5 to -0.7 | 61% (433/707) |
| too early | 171 | -0.2 | -1.9 | -3.6 to -0.2 | 52% (89/171) |
| all wallets | 940 | -0.4 | -1.3 | -1.7 to -0.9 | 60% (562/940) |

## How to read this

- A label is useful only if its newer-half mean sits clearly away from the all-wallets row and its interval excludes it. An interval that spans zero and the all-wallets mean says the label did not separate the groups.
- Groups with few wallets have wide intervals; the interval is the honest part of the table, the mean alone is not.
- Older and newer halves of the same wallet share its style, so this is not a clean out-of-sample trading test; it is the same split the persistence study used.
