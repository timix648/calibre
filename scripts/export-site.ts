// Writes the public, non-secret data the website and the MCP server read, to apps/web/data/.
//   pnpm export:site
// Verdicts and outcomes are rebuilt from Walrus Memory alone (the same recall as `pnpm verify`); the wallet index summary
// comes from the local index; the findings numbers are the ones in docs/FINDINGS.md. Nothing secret is written: the files
// hold wallet addresses and market data that are already public, plus Walrus blob IDs.
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { latestCheckpoint } from "../packages/chain/src/index.js";
import {
  auditVerdict, summariseGrades, type OutcomeData, type VerdictData, type WalletEdgeRow,
} from "../packages/core/src/index.js";
import { NAMESPACES, decode, latestByKey, type Envelope, type StoredMemory } from "../packages/memory/src/index.js";
import { MEMORY_STATE_FILE, WALLET_INDEX_FILE, memoryStore, readJson, suiClient } from "../apps/worker/src/lib/config.js";

const OUT = "apps/web/data";
const MAX_INDEX_ROWS = 300;
const MIN_INDEX_BETS = 30;
const walruscan = (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`;

const store = memoryStore();

// 1. Inventory per namespace
const listed = new Map<string, number>();
for (const ns of Object.values(NAMESPACES)) listed.set(ns, (await store.listMemories(ns)).length);
const relayer = await store.listNamespaces();
const namespaces = [...listed].map(([name, memories]) => ({ name, memories, relayerCount: relayer.find((n) => n.name === name)?.memoryCount ?? 0 }));
const total = namespaces.reduce((s, n) => s + n.memories, 0);

// 2. Verdicts and outcomes, recalled by meaning and decoded (recall returns at most 100 per query)
async function recallAll(namespace: string, queries: string[]): Promise<StoredMemory[]> {
  const byBlob = new Map<string, StoredMemory>();
  for (const query of queries) for (const m of await store.recall({ query, namespace, limit: 100 })) byBlob.set(m.blobId, m);
  return [...byBlob.values()];
}
const verdictMems = await recallAll(NAMESPACES.verdicts, ["CALIBRE verdict on a market move", "sharp-led move", "noise move wallets with a learned edge", "contested move", "mixed move"]);
const outcomeMems = await recallAll(NAMESPACES.outcomes, ["market resolved verdict forecast Brier against the market price", "beat the market price", "lost to the market price"]);

interface Sealed<T> { id: string; key: string; version: number; blobId: string; walruscan: string; summary: string; data: T }
function sealed<T>(mems: StoredMemory[], kind: string): Sealed<T>[] {
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
const verdicts = sealed<VerdictData>(verdictMems, "verdict").sort((a, b) => b.data.sealedAt.localeCompare(a.data.sealedAt));
const outcomes = sealed<OutcomeData>(outcomeMems, "outcome").sort((a, b) => b.data.gradedAt.localeCompare(a.data.gradedAt));

// 3. Wallet index summary: the strongest evidence either way, at least 30 bets, at most 300 rows
const indexRows = await readJson<WalletEdgeRow[]>(WALLET_INDEX_FILE, []);
const memState = await readJson<Record<string, { version: number; blobId: string }>>(MEMORY_STATE_FILE, {});
const eligible = indexRows.filter((r) => r.n >= MIN_INDEX_BETS && Number.isFinite(r.se));
const walletRows = eligible
  .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
  .slice(0, MAX_INDEX_ROWS)
  .map((r) => {
    const mem = memState[`${r.wallet}:${r.league}`];
    return {
      wallet: r.wallet, league: r.league, edge: r.edge, se: r.se, z: r.z, n: r.n,
      verdict: auditVerdict(r), updatedAt: r.updatedAt, blobId: mem?.blobId ?? null, memoryVersion: mem?.version ?? null,
    };
  });
const verdictCounts: Record<string, number> = {};
for (const r of eligible) verdictCounts[auditVerdict(r)] = (verdictCounts[auditVerdict(r)] ?? 0) + 1;

// 4. The latest Sui checkpoint, read through Tatum gRPC
let checkpoint: { sequence: string; timestamp: string | null } | null = null;
try {
  const c = await latestCheckpoint(suiClient());
  checkpoint = { sequence: String(c.sequence), timestamp: c.timestamp ?? null };
} catch (e) {
  console.warn(`could not read the latest checkpoint: ${(e as Error).message}`);
}

// 5. The findings table (numbers from docs/FINDINGS.md, corrected 3 Nov 2026)
const findings = {
  title: "On Polymarket sports, apparent trader skill does not persist once already-decided bets are removed",
  corrected: "2026-11-03",
  question: "Does a wallet's edge against the price it paid in its older bets predict its edge in its newer bets?",
  rows: [
    { sample: "Profit-blind active wallets", bets: "All, including already-decided bets (first run)", wallets: 40, rho: 0.41, p: 0.005, note: "Wallets repeatedly buying outcomes already decided, such as at 98 cents" },
    { sample: "Profit-blind active wallets", bets: "All, already-decided bets excluded", wallets: 40, rho: 0.12, p: 0.23, note: null },
    { sample: "Profit-blind active wallets", bets: "Pre-game only", wallets: 30, rho: 0.03, p: 0.45, note: null },
    { sample: "Profit-blind active wallets", bets: "In-play only", wallets: 40, rho: -0.1, p: 0.73, note: null },
    { sample: "Top earners on the profit leaderboard", bets: "All, already-decided bets excluded", wallets: 23, rho: -0.07, p: 0.63, note: null },
  ],
  readout: [
    "The first run's persistence came from wallets that repeatedly buy outcomes that are already decided. That earns a small steady edge, but it is not forecasting.",
    "Once those bets are removed, no group of wallets shows edge that carries over from older to newer bets, pre-game or in-play.",
    "The profit leaderboard is no better: the past edge of top earners does not predict their future edge.",
  ],
  caveats: [
    "65 wallets, one split per wallet; wallets trade the same events, so they are not independent.",
    "Real skill smaller than about 3 points per bet cannot be detected per wallet at these sample sizes; cohort-level tests with many more wallets could detect it.",
  ],
};

await mkdir(OUT, { recursive: true });
const generatedAt = new Date().toISOString();
const write = (name: string, value: unknown) => writeFile(`${OUT}/${name}`, JSON.stringify(value, null, 2) + "\n");
await write("verdicts.json", { generatedAt, verdicts });
await write("outcomes.json", { generatedAt, outcomes, grades: summariseGrades(outcomes.map((o) => ({ label: o.data.label, grade: o.data.grade }))) });
await write("wallet-index.json", {
  generatedAt, minBets: MIN_INDEX_BETS, totalRows: indexRows.length, totalWallets: new Set(indexRows.map((r) => r.wallet)).size,
  eligibleRows: eligible.length, verdictCounts, rows: walletRows,
});
await write("memory.json", { generatedAt, total, namespaces, checkpoint, sampleBlobs: walletRows.filter((r) => r.blobId).slice(0, 8).map((r) => ({ key: `${r.wallet}:${r.league}`, blobId: r.blobId, walruscan: walruscan(r.blobId!) })) });
await write("findings.json", findings);
await copyFile("docs/FINDINGS.md", `${OUT}/FINDINGS.md`);

console.log(`wrote ${OUT}: ${verdicts.length} verdicts, ${outcomes.length} outcomes, ${walletRows.length} wallet rows (of ${eligible.length} with ${MIN_INDEX_BETS}+ bets), ${total} memories, checkpoint ${checkpoint?.sequence ?? "unavailable"}`);
process.exit(0);
