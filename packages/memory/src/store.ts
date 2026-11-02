import { MemWal, type ScoringWeights } from "@mysten-incubation/memwal";

export interface StoredMemory {
  blobId: string;
  text: string;
  /** Cosine distance from the query (recall only); lower is closer. */
  distance?: number;
  createdAt?: string;
}

export interface RecallQuery {
  query: string;
  namespace: string;
  limit?: number;
  scoringWeights?: ScoringWeights;
}

/** The slice of Walrus Memory CALIBRE uses, so tests and backtests can run against a fake. */
export interface MemoryStore {
  remember(namespace: string, text: string): Promise<StoredMemory>;
  rememberBulk(namespace: string, texts: string[]): Promise<StoredMemory[]>;
  recall(q: RecallQuery): Promise<StoredMemory[]>;
}

export const NAMESPACES = {
  wallets: "calibre-wallets",
  verdicts: "calibre-verdicts",
  outcomes: "calibre-outcomes",
  lessons: "calibre-lessons",
} as const;

export class WalrusMemoryStore implements MemoryStore {
  private readonly client: MemWal;

  constructor(cfg: { key: string; accountId: string; serverUrl?: string }) {
    this.client = MemWal.create({ key: cfg.key, accountId: cfg.accountId, serverUrl: cfg.serverUrl });
  }

  async remember(namespace: string, text: string): Promise<StoredMemory> {
    const r = await this.client.rememberAndWait(text, namespace);
    return { blobId: r.blob_id, text };
  }

  async rememberBulk(namespace: string, texts: string[]): Promise<StoredMemory[]> {
    const out: StoredMemory[] = [];
    for (let i = 0; i < texts.length; i += 20) {
      const batch = texts.slice(i, i + 20);
      const r = await this.client.rememberBulkAndWait(batch.map((text) => ({ text, namespace })));
      const results = (r as unknown as { results?: { blob_id?: string }[] }).results ?? [];
      batch.forEach((text, j) => out.push({ blobId: results[j]?.blob_id ?? "", text }));
    }
    return out;
  }

  async recall(q: RecallQuery): Promise<StoredMemory[]> {
    const r = await this.client.recall({ query: q.query, namespace: q.namespace, limit: q.limit ?? 10, scoringWeights: q.scoringWeights });
    return r.results.map((m) => ({ blobId: m.blob_id, text: m.text, distance: m.distance, createdAt: m.created_at }));
  }
}

/** In-memory store for tests and offline backtests; recall ranks by shared words. */
export class FakeMemoryStore implements MemoryStore {
  readonly items: (StoredMemory & { namespace: string })[] = [];
  private n = 0;

  async remember(namespace: string, text: string): Promise<StoredMemory> {
    const m = { blobId: `fake-${++this.n}`, text, namespace, createdAt: new Date().toISOString() };
    this.items.push(m);
    return m;
  }

  async rememberBulk(namespace: string, texts: string[]): Promise<StoredMemory[]> {
    return Promise.all(texts.map((t) => this.remember(namespace, t)));
  }

  async recall(q: RecallQuery): Promise<StoredMemory[]> {
    const words = new Set(q.query.toLowerCase().split(/\W+/).filter(Boolean));
    return this.items
      .filter((m) => m.namespace === q.namespace)
      .map((m) => {
        const mw = m.text.toLowerCase().split(/\W+/);
        const hits = mw.filter((w) => words.has(w)).length;
        return { ...m, distance: 1 - hits / Math.max(1, words.size) };
      })
      .sort((a, b) => a.distance - b.distance)
      .slice(0, q.limit ?? 10);
  }
}
