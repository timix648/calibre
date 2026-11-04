// Wallet index rows for the watcher, built only from data already cached on disk (no network, no Tatum, no secrets).
//   nice -n 19 pnpm exec tsx scripts/export-index-from-cache.ts [--out .cache/index/wallets-wide.json]
//        [--sample .cache/wide-sample.json] [--replay .cache/results/square-replay.jsonl] [--cache .cache]
//        [--allow-partial] [--merge-into <wallets.json>]
//   pnpm exec tsx scripts/export-index-from-cache.ts --from <wallets-wide.json> --merge-into <wallets.json>
// Wallets: every wallet in the sample file, every taker recorded in the replay results, and the 25 top earners.
// A wallet with no cached history is skipped (it is never fetched). Rows have the format of .cache/index/wallets.json.
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createInterface } from "node:readline";
import { MIN_BETS_FOR_VERDICT, type ResolutionLike, type WalletEdgeRow } from "../packages/core/src/index.js";
import { cacheFile, cachedResolution, cachedWalletHistory, indexRows, mergeRows, takersOfReplayLine, uniqueWallets } from "./export-index-lib.js";

const argv = process.argv.slice(2);
const flags = new Map<string, string>();
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (!a.startsWith("--")) continue;
  const next = argv[i + 1];
  if (next !== undefined && !next.startsWith("--")) { flags.set(a.slice(2), next); i++; } else flags.set(a.slice(2), "true");
}
const CACHE = flags.get("cache") ?? ".cache";
const dirs = { publicDir: `${CACHE}/public`, tatumDir: `${CACHE}/tatum` };
const OUT = flags.get("out") ?? `${CACHE}/index/wallets-wide.json`;
const SAMPLE = flags.get("sample") ?? `${CACHE}/wide-sample.json`;
const REPLAY = flags.get("replay") ?? `${CACHE}/results/square-replay.jsonl`;
const MERGE_INTO = flags.get("merge-into");
const FROM = flags.get("from");
const ALLOW_PARTIAL = flags.has("allow-partial");

const readJson = async <T>(file: string): Promise<T | null> => { try { return JSON.parse(await readFile(file, "utf8")) as T; } catch { return null; } };

/** Write through a temp file and a rename, so a watcher reading the index never sees half of it. */
async function writeAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, file);
}

/** The 25 top earners: the cached Tatum top-traders list, else the "top" rows of the wide study results. */
async function topEarners(): Promise<string[]> {
  for (const path of ["/top-traders?category=SPORTS&limit=50", "/top-traders?category=SPORTS&limit=25"]) {
    const hit = await readJson<{ body: { data: { proxyWallet: string }[] } }>(cacheFile(dirs.tatumDir, path));
    if (hit?.body?.data?.length) return hit.body.data.map((t) => t.proxyWallet).slice(0, 25);
  }
  for (const file of [`${CACHE}/results/wide-all.json`, `${CACHE}/results/skill-persistence.json`]) {
    const res = await readJson<{ rows?: { group: string; wallet: string }[] }>(file);
    const top = (res?.rows ?? []).filter((r) => r.group === "top").map((r) => r.wallet).slice(0, 25);
    if (top.length) return top;
  }
  return [];
}

/** Takers of every move in the replay results, read line by line (the file can be large). */
async function replayTakers(): Promise<string[]> {
  const seen = new Set<string>();
  try {
    const lines = createInterface({ input: createReadStream(REPLAY, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of lines) for (const w of takersOfReplayLine(line)) seen.add(w);
  } catch { /* no replay file yet */ }
  return [...seen];
}

async function compute(): Promise<WalletEdgeRow[]> {
  const sample = (await readJson<string[]>(SAMPLE)) ?? [];
  const takers = await replayTakers();
  const top = await topEarners();
  const wallets = uniqueWallets(sample, takers, top);
  console.log(`wallets: ${wallets.length} (sample ${sample.length}, replay takers ${takers.length}, top earners ${top.length})`);

  const updatedAt = new Date().toISOString();
  const resolutions = new Map<string, ResolutionLike | null>();
  const rows: WalletEdgeRow[] = [];
  let noCache = 0, partial = 0, withRows = 0;
  for (const [i, wallet] of wallets.entries()) {
    const history = await cachedWalletHistory(dirs.publicDir, wallet, 1000);
    if (!history) { noCache++; continue; }
    if (history.partial && !ALLOW_PARTIAL) { partial++; continue; }
    for (const id of new Set(history.trades.map((t) => t.conditionId))) {
      if (!resolutions.has(id)) resolutions.set(id, await cachedResolution(dirs, id));
    }
    const walletRows = indexRows(wallet, history.trades, resolutions, updatedAt);
    if (walletRows.length) withRows++;
    rows.push(...walletRows);
    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${wallets.length}`);
    if ((i + 1) % 20 === 0) await new Promise((r) => setImmediate(r)); // let other work on the box run
  }
  rows.sort((a, b) => b.z - a.z);
  const eligible = rows.filter((r) => r.n >= MIN_BETS_FOR_VERDICT);
  console.log(`no cached history: ${noCache}; incomplete cache skipped: ${partial}; wallets with rows: ${withRows}`);
  console.log(`rows: ${rows.length} (${eligible.length} with n >= ${MIN_BETS_FOR_VERDICT}; ${eligible.filter((r) => r.z <= -2).length} with z <= -2, ${eligible.filter((r) => r.z >= 2).length} with z >= 2)`);
  console.log(`resolutions looked up: ${resolutions.size} (${[...resolutions.values()].filter(Boolean).length} resolved)`);
  return rows;
}

const rows = FROM ? (await readJson<WalletEdgeRow[]>(FROM)) ?? [] : await compute();
if (FROM) console.log(`read ${rows.length} rows from ${FROM}`);
else { await writeAtomic(OUT, rows); console.log(`wrote ${OUT}`); }

if (MERGE_INTO) {
  const existing = (await readJson<WalletEdgeRow[]>(MERGE_INTO)) ?? [];
  const before = new Set(existing.map((r) => `${r.wallet}:${r.league}`));
  const merged = mergeRows(existing, rows);
  const added = merged.filter((r) => !before.has(`${r.wallet}:${r.league}`)).length;
  await writeAtomic(MERGE_INTO, merged);
  console.log(`merged into ${MERGE_INTO}: ${existing.length} -> ${merged.length} rows (${added} new wallet-league rows, ${new Set(merged.map((r) => r.wallet)).size} wallets)`);
}
