#!/usr/bin/env bash
# Keeps the live site in step with Walrus without anyone pushing by hand.
#
# Every PUBLISH_EVERY_MIN minutes: grade whatever has resolved, export the site data out of Walrus, and if any of the
# exported files actually changed, commit just those files and push. Vercel redeploys on the push, so Radar, Record and
# Proof show what the watcher has sealed rather than whatever was exported last by hand.
#
# Usage: started by scripts/run-watcher.sh. On its own:
#   tmux new -d -s calibre-publish 'bash scripts/publish-loop.sh'
# Stop by session name only: tmux kill-session -t calibre-publish  (never pkill -f, see docs/VPS_OPS.md)
#
# It needs push rights: a deploy key with write access, or a remote with a token. It commits ONLY apps/web/data and
# docs/PROOF.md, so it can never push code, a stray file, or .env.
set -uo pipefail
cd "$(dirname "$0")/.."

PUBLISH_EVERY_MIN="${PUBLISH_EVERY_MIN:-120}"
BRANCH="${PUBLISH_BRANCH:-main}"
LOG=.cache/logs/publish.log
# The only paths this loop may ever commit.
PATHS=(apps/web/data docs/PROOF.md)

mkdir -p .cache/logs
[ -f .env ] || { echo "missing .env"; exit 1; }

log() { echo "$(date -u +%FT%TZ) $*" >> "$LOG"; }

git config user.name "timix648" >/dev/null 2>&1
git config user.email "142502851+timix648@users.noreply.github.com" >/dev/null 2>&1

log "publish loop started, every ${PUBLISH_EVERY_MIN} min, branch ${BRANCH}"

while true; do
  set -a; . ./.env; set +a

  if pnpm grade >> "$LOG" 2>&1; then log "grade ok"; else log "grade failed ($?), carrying on to export"; fi

  if pnpm export:site >> "$LOG" 2>&1; then
    # Only the data files, and only if they really changed: an export that rewrites a timestamp alone is not worth a deploy.
    if [ -n "$(git status --porcelain -- "${PATHS[@]}")" ]; then
      COUNTS=$(node -e '
        try {
          const v = require("./apps/web/data/verdicts.json");
          const o = require("./apps/web/data/outcomes.json");
          const outcomes = (o.outcomes ?? o).length;
          process.stdout.write(`${v.verdicts.length} verdicts, ${outcomes} graded`);
        } catch { process.stdout.write("refreshed"); }
      ' 2>/dev/null || echo refreshed)

      git add -- "${PATHS[@]}"
      # Belt and braces: never let anything outside PATHS into the commit.
      STAGED_OUTSIDE=$(git diff --cached --name-only | grep -vE '^(apps/web/data/|docs/PROOF\.md$)' || true)
      if [ -n "$STAGED_OUTSIDE" ]; then
        log "REFUSING to commit, unexpected staged paths: $STAGED_OUTSIDE"
        git reset >> "$LOG" 2>&1
      elif git commit -q -m "Publish the latest sealed record: ${COUNTS}." >> "$LOG" 2>&1; then
        if git push origin "$BRANCH" >> "$LOG" 2>&1; then
          log "published: ${COUNTS}"
        else
          log "push FAILED; the commit is local and the next round will try again"
        fi
      else
        log "nothing to commit after all"
      fi
    else
      log "no change in the exported data; nothing to publish"
    fi
  else
    log "export failed ($?); leaving the site as it is and trying again next round"
  fi

  sleep $((PUBLISH_EVERY_MIN * 60))
done
