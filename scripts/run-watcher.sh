#!/usr/bin/env bash
# Long-running CALIBRE engine for a server: watches markets every 10 minutes and grades sealed verdicts every hour,
# restarting either loop if it crashes. Tatum use is capped per hour so the remaining credits last to the deadline.
# Usage: tmux new -d -s calibre-watch 'nice -n 10 bash scripts/run-watcher.sh'
# Stop it by session name only: tmux kill-session -t calibre-watch
# Never stop it with pkill -f: that matches every process whose command line contains the text, remote shells included.
# Backups must leave .env out and a teardown must delete it: see docs/VPS_OPS.md.
set -uo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "missing .env (copy it from the laptop, then chmod 600 .env)"; exit 1; }
chmod 600 .env
mkdir -p .cache/logs

# These three are read from the environment first, then from .env, then from the defaults below. The script used to read
# the environment only, which was a trap: TATUM_HOURLY in .env looked like it was configuring the watcher while line 26
# quietly passed the default 18 on the command line, and the flag beats the file. Set it in either place now.
_preset_hourly="${TATUM_HOURLY:-}"; _preset_jump="${MIN_JUMP:-}"; _preset_loop="${LOOP_MIN:-}"
set -a; . ./.env; set +a
TATUM_HOURLY="${_preset_hourly:-${TATUM_HOURLY:-18}}"
MIN_JUMP="${_preset_jump:-${MIN_JUMP:-0.04}}"
LOOP_MIN="${_preset_loop:-${LOOP_MIN:-10}}"

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
trap 'kill $WATCH_PID $GRADE_PID 2>/dev/null; exit 0' INT TERM HUP
wait
