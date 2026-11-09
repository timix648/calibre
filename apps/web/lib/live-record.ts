/**
 * The sealed record, read from Walrus Memory at request time.
 *
 * The site used to show only what `pnpm export:site` had last written into `apps/web/data`, so a verdict the watcher sealed
 * was invisible until somebody exported and pushed. Here the server recalls the memories itself, every REVALIDATE_MS at
 * most, and the pages show what Walrus actually holds. Nothing has to be committed for the record to move.
 *
 * Needs MEMWAL_PRIVATE_KEY, MEMWAL_ACCOUNT_ID and MEMWAL_SERVER_URL in the environment. Without them, or when a recall
 * fails (the relayer's Sui RPC has been flaky), it falls back to the committed files, which are a real export and never
 * wrong, only older. `source` says which one a page is showing, so the site can be honest about it.
 */
import type { OutcomeData, VerdictData } from "@calibre/core";
import { NAMESPACES, RECALL_QUERIES, WalrusMemoryStore, recallAll, sealed } from "@calibre/memory";
import { grades as staticGrades, outcomes as staticOutcomes, dataGeneratedAt as staticGeneratedAt, verdicts as staticVerdicts, type SealedRecord } from "./data";

export type RecordSource = "walrus" | "exported-file";

export interface LiveRecord {
  verdicts: SealedRecord<VerdictData>[];
  outcomes: SealedRecord<OutcomeData>[];
  grades: typeof staticGrades;
  generatedAt: string;
  source: RecordSource;
  /** Why the committed file is being shown, when it is. */
  note: string | null;
}

const REVALIDATE_MS = 10 * 60_000;
/**
 * A recall that has not answered in this long is treated as a failure, so a page is never left hanging. One query per
 * merged read measured 25 to 33 seconds from a home connection on 9 Nov, so 50 leaves room for a slower one
 * while staying inside the page's own 60-second limit.
 */
const TIMEOUT_MS = 50_000;

const fallback = (note: string | null): LiveRecord => ({
  verdicts: staticVerdicts,
  outcomes: staticOutcomes,
  grades: staticGrades,
  generatedAt: staticGeneratedAt,
  source: "exported-file",
  note,
});

let cache: { at: number; value: LiveRecord } | null = null;
let inflight: Promise<LiveRecord> | null = null;

function store(): WalrusMemoryStore | null {
  const key = process.env.MEMWAL_PRIVATE_KEY?.trim();
  const accountId = process.env.MEMWAL_ACCOUNT_ID?.trim();
  if (!key || !accountId) return null;
  return new WalrusMemoryStore({ key, accountId, serverUrl: process.env.MEMWAL_SERVER_URL?.trim() || undefined });
}

async function read(): Promise<LiveRecord> {
  const s = store();
  if (!s) return fallback("Walrus keys are not set on this deployment");

  const deadline = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`recall took longer than ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS));
  // The same merged query set the export uses, so the site sees past the 100-per-query ceiling. They run together, which
  // keeps the whole thing to about the time of the slowest single query rather than the sum of all of them.
  const [verdictMems, outcomeMems] = await Promise.race([
    Promise.all([
      recallAll(s, NAMESPACES.verdicts, RECALL_QUERIES.verdicts),
      recallAll(s, NAMESPACES.outcomes, RECALL_QUERIES.outcomes),
    ]),
    deadline,
  ]);

  const verdicts = sealed<VerdictData>(verdictMems, "verdict").sort((a, b) => b.data.sealedAt.localeCompare(a.data.sealedAt));
  const outcomes = sealed<OutcomeData>(outcomeMems, "outcome").sort((a, b) => b.data.gradedAt.localeCompare(a.data.gradedAt));
  // A recall that comes back with less than the last export did is a partial answer, not news: keep the fuller record.
  if (verdicts.length < staticVerdicts.length) {
    return fallback(`Walrus returned ${verdicts.length} verdicts, fewer than the ${staticVerdicts.length} already exported`);
  }
  return {
    verdicts: verdicts as unknown as SealedRecord<VerdictData>[],
    outcomes: outcomes as unknown as SealedRecord<OutcomeData>[],
    grades: staticGrades,
    generatedAt: new Date().toISOString(),
    source: "walrus",
    note: null,
  };
}

/** The record as it stands, recalled at most every ten minutes and never throwing: a failure shows the committed export. */
export async function liveRecord(): Promise<LiveRecord> {
  if (cache && Date.now() - cache.at < REVALIDATE_MS) return cache.value;
  inflight ??= read()
    .catch((e: unknown) => fallback(`Walrus could not be read: ${e instanceof Error ? e.message : String(e)}`))
    .then((value) => {
      // Only a real read refreshes the clock, so a failing relayer is retried rather than cached for ten minutes.
      if (value.source === "walrus") cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => { inflight = null; });
  return inflight;
}
