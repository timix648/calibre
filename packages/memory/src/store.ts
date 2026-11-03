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

/** Inventory metadata of one stored memory (no content: use recall for text). */
export interface MemoryListing {
  memoryId: string;
  blobId: string;
  namespace: string;
  createdAt: string;
}

export interface NamespaceInfo {
  name: string;
  memoryCount: number;
}

/** The slice of Walrus Memory CALIBRE uses, so tests and backtests can run against a fake. */
export interface MemoryStore {
  remember(namespace: string, text: string): Promise<StoredMemory>;
  /** Results keep the input order; a write that failed comes back with an empty blobId. */
  rememberBulk(namespace: string, texts: string[]): Promise<StoredMemory[]>;
  recall(q: RecallQuery): Promise<StoredMemory[]>;
  /** Every memory held in a namespace (all namespaces when omitted), walked page by page. */
  listMemories(namespace?: string): Promise<MemoryListing[]>;
  listNamespaces(): Promise<NamespaceInfo[]>;
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

  async listMemories(namespace?: string): Promise<MemoryListing[]> {
    const out: MemoryListing[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.client.listMemories({ cursor, namespace, limit: 500 });
      for (const m of page.memories) out.push({ memoryId: m.memory_id, blobId: m.blob_id, namespace: m.namespace_id, createdAt: m.created_at });
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
    }
    return out;
  }

  async listNamespaces(): Promise<NamespaceInfo[]> {
    const out: NamespaceInfo[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await this.client.listNamespaces({ cursor, limit: 500 });
      for (const n of page.namespaces) out.push({ name: n.name, memoryCount: n.memory_count });
      if (!page.has_more || !page.next_cursor) break;
      cursor = page.next_cursor;
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

  async listMemories(namespace?: string): Promise<MemoryListing[]> {
    return this.items
      .filter((m) => !namespace || m.namespace === namespace)
      .map((m) => ({ memoryId: m.blobId, blobId: m.blobId, namespace: m.namespace, createdAt: m.createdAt ?? "" }));
  }

  async listNamespaces(): Promise<NamespaceInfo[]> {
    const counts = new Map<string, number>();
    for (const m of this.items) counts.set(m.namespace, (counts.get(m.namespace) ?? 0) + 1);
    return [...counts].map(([name, memoryCount]) => ({ name, memoryCount }));
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
