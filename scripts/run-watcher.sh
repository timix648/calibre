#!/usr/bin/env bash
# Long-running CALIBRE engine for a server: watches markets every 10 minutes and grades sealed verdicts every hour,
# restarting either loop if it crashes. Tatum use is capped per hour so the remaining credits last to the deadline.
# Usage: bash scripts/run-watcher.sh   (stop with: pkill -f run-watcher.sh; pkill -f "apps/worker")
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "missing .env (copy it from the laptop, then chmod 600 .env)"; exit 1; }
chmod 600 .env
mkdir -p .cache/logs

TATUM_HOURLY="${TATUM_HOURLY:-12}"     # ~1,350 calls left on the guard / ~120 hours to the deadline
MIN_JUMP="${MIN_JUMP:-0.04}"
LOOP_MIN="${LOOP_MIN:-10}"

trim() { # keep logs under ~20 MB
  local f="$1"; [ -f "$f" ] && [ "$(stat -c %s "$f")" -gt 20000000 ] && tail -c 5000000 "$f" > "$f.tmp" && mv "$f.tmp" "$f"; true
}

watch_loop() {
  while true; do
    echo "$(date -u +%FT%TZ) watch start" >> .cache/logs/watch.log
    pnpm watch --loop "$LOOP_MIN" --min-jump "$MIN_JUMP" --tatum-hourly "$TATUM_HOURLY" --discover-every 120 >> .cache/logs/watch.log 2>&1
    echo "$(date -u +%FT%TZ) watch exited with $?; restarting in 60 s" >> .cache/logs/watch.log
    trim .cache/logs/watch.log
    sleep 60
  done
}

grade_loop() {
  while true; do
    echo "$(date -u +%FT%TZ) grade" >> .cache/logs/grade.log
    pnpm grade >> .cache/logs/grade.log 2>&1 || echo "$(date -u +%FT%TZ) grade failed with $?" >> .cache/logs/grade.log
    trim .cache/logs/grade.log
    sleep 3600
  done
}

watch_loop & WATCH_PID=$!
grade_loop & GRADE_PID=$!
echo "$(date -u +%FT%TZ) started watch=$WATCH_PID grade=$GRADE_PID tatum_hourly=$TATUM_HOURLY" | tee -a .cache/logs/watch.log
trap 'kill $WATCH_PID $GRADE_PID 2>/dev/null; exit 0' INT TERM
wait
