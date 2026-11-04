# Running the watcher on a server: stop, back up, tear down

The watcher (`scripts/run-watcher.sh`) and the long studies run in `tmux` sessions on a rented server. The server holds `.env`
(the Tatum key, the Walrus Memory delegate key, the account id), so how it is stopped, backed up and removed matters.

## Stop: by session name only

```bash
tmux ls                                  # sessions: calibre-watch (watcher and grader), calibre-replay, calibre-study
tmux kill-session -t calibre-watch       # stops the watcher and the grader loop
tmux kill-session -t calibre-replay      # stops the square-money replay
```

Never use `pkill -f run-watcher.sh`, `pkill -f apps/worker` or any other `pkill -f` / `pkill -9 -f`. They match every process whose
command line contains the text, and that includes the remote shell of the very session that typed the command, so the
connection drops and the cleanup stops half done. A session name matches exactly one thing.

Check that nothing is left (this only prints; it kills nothing):

```bash
tmux ls 2>&1 | head -5
ps -eo pid,etime,args | grep -E '[a]pps/worker|[r]un-watcher' || echo "nothing running"
```

The `[a]` in the pattern stops grep from matching its own command line.

## Back up without secrets

A backup must never contain `.env`. Exclude it, and any `.env.*` variant, every time:

```bash
cd ~/calibre-watch
# code only (about 1 MB)
tar -czf ~/calibre-watch-backup-$(date +%Y%m%d%H%M).tgz --exclude=.env --exclude='.env.*' --exclude=node_modules --exclude=.cache .
# state worth keeping: the sealed-verdict ledger, the pending seals, the wallet index, the Tatum counter
tar -czf ~/calibre-watch-state-$(date +%Y%m%d%H%M).tgz --exclude=.env --exclude='.env.*' .cache/worker .cache/index .cache/tatum-calls.json
# prove it: both must print 0
tar -tzf "$(ls -t ~/calibre-watch-backup-*.tgz | head -1)" | grep -cE '(^|/)\.env'
tar -tzf "$(ls -t ~/calibre-watch-state-*.tgz | head -1)" | grep -cE '(^|/)\.env'
```

An archive made without the excludes (for example `tar -czf x.tgz .` inside the project directory) contains `.env`. Treat it as a
secret: delete it with the teardown below.

To bring the results home, copy the ledgers and logs, not the project directory:

```bash
scp -r <server>:~/calibre-watch/.cache/worker <server>:~/calibre-watch/.cache/logs ./research/vps-watch-results/
```

## Teardown (when the run is over)

1. Stop every session by name (above) and check that nothing is left.
2. Copy the results home (`.cache/worker`, which holds `verdicts.json`, `outcomes.json` and `pending-seals.json`, and the logs).
3. Delete `.env` **and every backup archive that may contain it**, not only `.env` itself:

   ```bash
   shred -u ~/calibre-watch/.env ~/calibre-watch-backup-*.tgz
   ```

   Archives made with the excludes above hold no secret and may stay; the glob removes them too, which is fine after the results
   are home. `shred` is best effort on a journaling filesystem or an SSD. It is the second line of defence: the first is never
   writing the secret into an archive.
4. Look for any other copy of the file and for stray archives:

   ```bash
   find ~ -maxdepth 4 \( -name '.env' -o -name '.env.*' -o -name '*backup*.tgz' \) -not -path '*/node_modules/*' 2>/dev/null
   ```

   Delete what it lists (`shred -u <file>`). `~/calibre-study` does not need an `.env`; if one was copied there, shred it too.
5. Remove the code and cache if the server is not needed any more: `rm -rf ~/calibre-watch ~/calibre-study`.
6. If an archive that contained `.env` ever left the server (a download, a shared folder, a message), rotate the keys in it:
   issue a new Tatum key, and replace the Walrus Memory key (`MEMWAL_PRIVATE_KEY`).
