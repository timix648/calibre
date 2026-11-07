/**
 * Rebuilding the sealed record from Walrus Memory. Shared by `pnpm export:site`, `pnpm verify` and the website, so the page
 * a visitor sees and the file in the repository are built the same way from the same memories.
 */
import { decode, latestByKey, type Envelope } from "./envelope";
import type { MemoryStore, StoredMemory } from "./store";

export const walruscan = (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`;

/**
 * The recall queries that between them reach every verdict and outcome. Recall returns at most 100 memories for one query,
 * so several queries are merged by blob id to get past that ceiling. Used by the export, which has all the time it needs.
 */
export const RECALL_QUERIES = {
  verdicts: ["CALIBRE verdict on a market move", "sharp-led move", "noise move wallets with a learned edge", "contested move", "mixed move"],
  outcomes: ["market resolved verdict forecast Brier against the market price", "beat the market price", "lost to the market price"],
} as const;

/**
 * One query per namespace, for the website, where a page cannot wait. Measured 6 Nov 2026: the full five-query merge takes
 * about 52 seconds, while a single query returns the same 62 verdicts in 8 to 13. That holds only while a namespace is
 * under the 100-memory recall ceiling — `enoughFor` below is the check that it still is.
 */
export const FAST_RECALL_QUERIES = {
  verdicts: "CALIBRE verdict on a market move",
  outcomes: "market resolved verdict forecast Brier against the market price",
} as const;

/** The recall ceiling. A namespace at or above this needs the merged queries, because one query can no longer see it all. */
export const RECALL_LIMIT = 100;

export interface Sealed<T> {
  id: string;
  key: string;
  version: number;
  blobId: string;
  walruscan: string;
  summary: string;
  data: T;
}

/**
 * Every memory several queries reach, merged by blob id so a memory two queries both find is counted once. Needed because
 * `limit` is capped at 100 server-side (checked: 150 and 200 both return 100), so one query cannot see a namespace that has
 * outgrown that.
 *
 * `concurrency` queries at a time. Not one at a time, because each takes 8 to 13 seconds against the mainnet relayer and a
 * page cannot wait a minute; not all at once either, because eight concurrent recalls make the relayer answer
 * `504 Recall timed out during seal_decrypt`. Two is what the relayer takes without complaint.
 */
export async function recallAll(
  store: MemoryStore,
  namespace: string,
  queries: readonly string[],
  opts: { concurrency?: number } = {},
): Promise<StoredMemory[]> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const byBlob = new Map<string, StoredMemory>();
  for (let i = 0; i < queries.length; i += concurrency) {
    const batch = await Promise.all(
      queries.slice(i, i + concurrency).map((query) => store.recall({ query, namespace, limit: RECALL_LIMIT })),
    );
    for (const memories of batch) for (const m of memories) byBlob.set(m.blobId, m);
  }
  return [...byBlob.values()];
}

/** Decode memories of one kind, keeping the latest version of each key, with the blob each came from. */
export function sealed<T>(mems: StoredMemory[], kind: string): Sealed<T>[] {
  const blobOf = new Map<string, string>();
  const texts: string[] = [];
  for (const m of mems) {
    const e = decode(m.text);
    if (e?.kind !== kind) continue;
    texts.push(m.text);
    blobOf.set(`${e.key}:${e.version}`, m.blobId);
  }
  return [...latestByKey<T>(texts, kind).values()].map((e: Envelope<T>) => {
    const blobId = blobOf.get(`${e.key}:${e.version}`) ?? "";
    return { id: e.key.replace(/:/g, "-"), key: e.key, version: e.version, blobId, walruscan: walruscan(blobId), summary: e.summary, data: e.data };
  });
}
