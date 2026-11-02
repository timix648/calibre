# CALIBRE

Learns who is actually right about what, from onchain track records, and turns it into a better forecast.

Built for **Total Recall: Tatum x Walrus Memory Hackathon** (Track 01, Markets & Sports Prediction).
Status: day 0, work in progress.

## Idea in one paragraph

Fans and forecasters follow tipsters and prediction-market whales without knowing who is actually good at what.
CALIBRE scores every source **against the market price at the time of the pick** (Brier skill score, per category,
shrunk for small samples) and blends the skilled ones into a forecast. Every pick, outcome and credibility version is a
memory on Walrus Memory (Sui mainnet), and market data comes from Tatum's Prediction Markets API.

## Layout

| Path | What |
|---|---|
| `packages/core` | Pure scoring: Brier, skill vs market, shrinkage, logit blending, calibration (tested) |
| `scripts/spike-*.ts` | Day-0 checks against the real Tatum and Walrus Memory mainnet APIs |

## Run

```bash
pnpm install
pnpm test
cp .env.example .env   # then fill in keys
pnpm spike:prediction
pnpm spike:grpc
pnpm spike:memwal
```
