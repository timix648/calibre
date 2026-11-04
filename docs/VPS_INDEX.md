# Wider wallet index for the watcher (VPS)

The watcher labels the wallets behind a move from `.cache/index/wallets.json`, which holds about 200 wallets. The VPS study
cache (`~/calibre-study`) holds the public trade histories of thousands more. This builds index rows from that cache alone
and merges them into the watcher's index, so more of the money behind a move can be judged (the "coverage" figure on each
verdict).

`scripts/export-index-from-cache.ts` reads files only. It never calls Polymarket, Gamma or Tatum, needs no `.env`, and skips
any wallet whose history is not already cached. Wallets: everything in `.cache/wide-sample.json`, every taker in
`.cache/results/square-replay.jsonl` (`takers[].wallet`), and the 25 top earners (the cached top-traders list, else the
`top` rows of the study results). Rows have the format of `wallets.json` and are computed exactly as the indexer does
(pre-game bets, one pick per market, half-life 60 days, one row per league; the indexer has no separate "overall" row).
On the laptop it reproduced 872 of 876 existing index rows exactly; the other four were new wallet-league rows.

## 1. Package the scripts on the laptop

The script needs the current `packages/core/src` (the study copy may be older; core only grows, so overwriting is safe).

```bash
cd C:/Users/USER/Downloads/calibre
git archive -o export-index.tar.gz HEAD scripts/export-index-from-cache.ts scripts/export-index-lib.ts packages/core/src
scp export-index.tar.gz <vps>:~/
```

## 2. Build the rows on the VPS (after the replay has finished)

```bash
ls ~/calibre-study/.cache/results/SQUARE_DONE   # exists only once the replay has finished
tmux ls | grep calibre-replay || echo "replay not running"   # stop a running one by name: tmux kill-session -t calibre-replay

cd ~/calibre-study
tar xzf ~/export-index.tar.gz
nice -n 19 pnpm exec tsx scripts/export-index-from-cache.ts
```

It prints the wallet count, wallets with no cached history, rows, and how many rows are labelable (n >= 30, z <= -2, z >= 2).
Output: `~/calibre-study/.cache/index/wallets-wide.json`. It runs one wallet at a time and streams the replay file, so it is
light; `nice -n 19` keeps it behind everything else.

## 3. Copy and merge into the watcher

Stop and restart the watcher by session name only (`tmux kill-session -t calibre-watch`), never with `pkill -f`, and keep `.env` out of every
backup (`--exclude=.env --exclude='.env.*'`). Stopping, backups and teardown are in `docs/VPS_OPS.md`.

```bash
mkdir -p ~/calibre-watch/.cache/index
cp ~/calibre-study/.cache/index/wallets-wide.json ~/calibre-watch/.cache/index/
cd ~/calibre-watch
tar xzf ~/export-index.tar.gz scripts/export-index-from-cache.ts scripts/export-index-lib.ts   # core there is current
cp .cache/index/wallets.json .cache/index/wallets.before-wide.json
nice -n 19 pnpm exec tsx scripts/export-index-from-cache.ts --from .cache/index/wallets-wide.json --merge-into .cache/index/wallets.json
```

The merge keeps one row per (wallet, league). The row with the later `updatedAt` wins, and on a tie the incoming row
wins; rows the export does not cover stay as they are. The file is replaced with a rename, so a reader never sees half of it.
To undo: `cp .cache/index/wallets.before-wide.json .cache/index/wallets.json`.

## Does the watcher need a restart?

No. `apps/worker/src/watch.ts` calls `loadIndex()` at the start of every `scan()` pass (every 10 minutes in the loop), and
`grade.ts` loads it on each run, so the merged index is used from the next pass on. Do not run `pnpm index` on the VPS
afterwards: it rewrites `wallets.json` from its own wallet list and would drop the merged rows. Verdicts already sealed keep
the labels they were sealed with; only new verdicts see the wider index.
