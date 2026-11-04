# Label validation

> **Preliminary (40 wallets).** Regenerated from the wide study logs once they are in; do not quote these numbers as findings.

Question: does the X-ray label a wallet would have had from its older bets say anything about how it does on its newer bets?

## Method

- Source: the per-wallet lines of the skill-persistence study logs (skill-persistence-allphase.log, skill-persistence-pregame.log, skill-persistence-inplay.log). Each wallet's bets are split at the middle: the older half is what the X-ray would have known, the newer half is what happened next.
- Wallets: the profit-blind sample only (wallets drawn from the same markets, not picked for profit).
- Label from the older half, with the rules of the live X-ray: proven losing record = z <= -2 over at least 30 bets; positive record = z >= 2 over at least 100 bets; too early = fewer than 30 bets; otherwise no proven edge. "Mostly sniping" cannot be derived from the logs and is left out.
- Edge: points won above the price paid, per bet, on one pick per market. Mean newer-half edge comes with a percentile bootstrap 95% interval (2,000 resamples over wallets, fixed seed). A wallet counts once, whatever its size.
- n for the label is floor(picks / 2), the size of the older half.

## All bets

40 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 4 | -6.0 | -2.9 | -4.0 to -1.9 | 100% (4/4) |
| positive record (unproven going forward) | 1 | +10.4 | +1.0 | n/a (fewer than 2 wallets) | 0% (0/1) |
| no proven edge | 33 | -0.4 | -0.4 | -1.9 to +0.9 | 55% (18/33) |
| too early | 2 | +6.4 | -6.8 | -19.7 to +6.2 | 50% (1/2) |
| all wallets | 40 | -0.3 | -1.0 | -2.6 to +0.5 | 57% (23/40) |

## Pre-game bets

30 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 0 | n/a | n/a | n/a (fewer than 2 wallets) | n/a |
| positive record (unproven going forward) | 0 | n/a | n/a | n/a (fewer than 2 wallets) | n/a |
| no proven edge | 25 | +0.0 | -1.4 | -3.4 to +0.6 | 60% (15/25) |
| too early | 5 | +9.0 | +1.5 | -9.7 to +13.9 | 40% (2/5) |
| all wallets | 30 | +1.5 | -0.9 | -3.3 to +1.7 | 57% (17/30) |

## In-play bets

40 wallets with a result line.

| Label from older half | Wallets | Mean older edge (pts) | Mean newer edge (pts) | 95% interval | Share with negative newer edge |
|---|---:|---:|---:|---|---:|
| proven losing record | 3 | -10.8 | +0.9 | -4.1 to +10.4 | 67% (2/3) |
| positive record (unproven going forward) | 1 | +4.9 | -1.9 | n/a (fewer than 2 wallets) | 100% (1/1) |
| no proven edge | 28 | -0.6 | -1.8 | -3.8 to +0.0 | 64% (18/28) |
| too early | 8 | +0.7 | +4.4 | -4.0 to +12.6 | 38% (3/8) |
| all wallets | 40 | -1.0 | -0.3 | -2.6 to +2.1 | 60% (24/40) |

## How to read this

- A label is useful only if its newer-half mean sits clearly away from the all-wallets row and its interval excludes it. An interval that spans zero and the all-wallets mean says the label did not separate the groups.
- Groups with few wallets have wide intervals; the interval is the honest part of the table, the mean alone is not.
- Older and newer halves of the same wallet share its style, so this is not a clean out-of-sample trading test; it is the same split the persistence study used.
