#!/usr/bin/env bash
# Wider skill-persistence study: a large profit-blind wallet sample, scored in three bet phases.
# Uses only Polymarket's free public APIs and one cached top-traders list. Needs no secrets and makes no Tatum calls
# (TATUM_CALL_BUDGET=0 makes any accidental Tatum call fail instead of spending credits).
set -euo pipefail
cd "$(dirname "$0")/.."

export SOURCE=public SAMPLE=active PREGAME=1
export N_TOP=25 TRADES=1000
export N_RANDOM="${N_RANDOM:-300}" MARKETS="${MARKETS:-600}"
export SAMPLE_FILE=.cache/wide-sample.json
export TATUM_API_KEY=public-data-only TATUM_CALL_BUDGET=0

mkdir -p .cache/results .cache/logs
rm -f .cache/results/DONE .cache/results/FAILED
trap 'echo "failed at $(date -u +%FT%TZ)" > .cache/results/FAILED' ERR

for phase in all pregame inplay; do
  echo "$(date -u +%FT%TZ) phase=$phase start" | tee -a .cache/logs/wide-progress.log
  PHASE="$phase" RESULTS_FILE=".cache/results/wide-$phase.json" \
    pnpm exec tsx scripts/skill-persistence.ts > ".cache/logs/wide-$phase.log" 2>&1
  echo "$(date -u +%FT%TZ) phase=$phase done" | tee -a .cache/logs/wide-progress.log
done

pnpm exec tsx scripts/summarize-study.ts .cache/results/wide-all.json .cache/results/wide-pregame.json .cache/results/wide-inplay.json \
  > .cache/results/WIDE_REPORT.md
date -u +%FT%TZ > .cache/results/DONE
echo "Report: .cache/results/WIDE_REPORT.md"
