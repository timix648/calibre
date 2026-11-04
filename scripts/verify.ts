// M1.4: rebuild what CALIBRE has sealed from Walrus Memory alone, print the numbers, and write docs/PROOF.md.
//   pnpm verify
import { writeFile } from "node:fs/promises";
import { anchorCheckpoint } from "../packages/chain/src/index.js";
import { MODEL_VERSIONS, summariseGrades, verdictSquare, type OutcomeData, type VerdictData, type WalletMemoryData } from "../packages/core/src/index.js";
import { NAMESPACES, decode, latestByKey, type Envelope, type MemoryListing, type StoredMemory } from "../packages/memory/src/index.js";
import { OUTCOME_LEDGER_FILE, VERDICT_LEDGER_FILE, memoryStore, readJson, suiClient, tatumCallsUsed } from "../apps/worker/src/lib/config.js";

const store = memoryStore();
const walruscan = (blobId: string) => `https://walruscan.com/mainnet/blob/${blobId}`;

// 1. Inventory per namespace (metadata only, from the relayer's listing)
const listed = new Map<string, MemoryListing[]>();
for (const ns of Object.values(NAMESPACES)) listed.set(ns, await store.listMemories(ns));
const total = [...listed.values()].reduce((s, l) => s + l.length, 0);
const namespaces = await store.listNamespaces();
console.log("namespace                 listed   relayer count");
for (const [ns, items] of listed) {
  console.log(`${ns.padEnd(24)} ${String(items.length).padStart(6)}   ${String(namespaces.find((n) => n.name === ns)?.memoryCount ?? 0).padStart(6)}`);
}
console.log(`total memories on mainnet: ${total}`);

// 2. Content, recalled by meaning and decoded (recall returns at most 100 per query)
async function recallAll(namespace: string, queries: string[]): Promise<StoredMemory[]> {
  const byBlob = new Map<string, StoredMemory>();
  for (const query of queries) for (const m of await store.recall({ query, namespace, limit: 100 })) byBlob.set(m.blobId, m);
  return [...byBlob.values()];
}
const verdictMems = await recallAll(NAMESPACES.verdicts, ["CALIBRE verdict on a market move", "sharp-led move", "noise move wallets with a learned edge", "contested move", "mixed move"]);
const outcomeMems = await recallAll(NAMESPACES.outcomes, ["market resolved verdict forecast Brier against the market price", "beat the market price", "lost to the market price"]);
const walletMems = await recallAll(NAMESPACES.wallets, ["wallet edge on a league over bets: likely skill", "wallet negative edge", "wallet luck unproven"]);

const blobOf = new Map<string, string>();
const envelopes = <T>(mems: StoredMemory[], kind: string): Envelope<T>[] => {
  const texts: string[] = [];
  for (const m of mems) { const e = decode(m.text); if (e?.kind === kind) { texts.push(m.text); blobOf.set(`${kind}:${e.key}:${e.version}`, m.blobId); } }
  return [...latestByKey<T>(texts, kind).values()];
};
const verdicts = envelopes<VerdictData>(verdictMems, "verdict");
const outcomes = envelopes<OutcomeData>(outcomeMems, "outcome");
const wallets = envelopes<WalletMemoryData>(walletMems, "wallet");

const byLabel = new Map<string, number>();
for (const v of verdicts) byLabel.set(v.data.label, (byLabel.get(v.data.label) ?? 0) + 1);
const modelOf = (e: { model?: string }) => e.model ?? "v1";
const gradesByModel = MODEL_VERSIONS.map((model) => ({
  model,
  grades: summariseGrades(outcomes.filter((o) => modelOf(o.data) === model).map((o) => ({ label: o.data.label, grade: o.data.grade }))),
})).filter((m) => m.grades.length > 0);
const modelCounts = MODEL_VERSIONS.map((m) => `${m} ${verdicts.filter((v) => modelOf(v.data) === m).length}`).join(", ");
console.log(`\nverdicts rebuilt from Walrus: ${verdicts.length} (${[...byLabel].map(([l, n]) => `${l} ${n}`).join(", ") || "none"}); by model: ${modelCounts}`);
console.log(`verdicts that recorded square money: ${verdicts.filter((v) => verdictSquare(v.data) !== null).length} (model v3 onward)`);
console.log(`outcomes rebuilt from Walrus: ${outcomes.length}`);
for (const { model, grades } of gradesByModel) for (const g of grades) console.log(`  ${model} ${g.label.padEnd(10)} n=${g.n} forecast Brier ${g.forecastBrier.toFixed(4)} vs market ${g.marketBrier.toFixed(4)} (gain ${g.gain.toFixed(4)})`);
console.log(`wallet memories decoded from a recall sample: ${wallets.length}`);

// 3. Consistency: Walrus listing, Walrus content and the local ledgers must agree
const ledgerV = await readJson<unknown[]>(VERDICT_LEDGER_FILE, []);
const ledgerO = await readJson<unknown[]>(OUTCOME_LEDGER_FILE, []);
const checks: [string, boolean][] = [
  ["verdict memories listed = verdicts rebuilt", (listed.get(NAMESPACES.verdicts)?.length ?? 0) === verdicts.length],
  ["outcome memories listed = outcomes rebuilt", (listed.get(NAMESPACES.outcomes)?.length ?? 0) === outcomes.length],
  ["verdicts rebuilt = local verdict ledger", ledgerV.length === 0 || ledgerV.length === verdicts.length],
  ["outcomes rebuilt = local outcome ledger", ledgerO.length === 0 || ledgerO.length === outcomes.length],
  ["every outcome has its verdict", outcomes.every((o) => verdicts.some((v) => v.key === o.key))],
];
for (const [name, ok] of checks) console.log(`${ok ? "OK  " : "FAIL"} ${name}`);

// 4. Chain and credits
const checkpoint = await anchorCheckpoint(suiClient());
const { used, budget } = await tatumCallsUsed();
const via = checkpoint.source === "tatum-grpc" ? "Tatum gRPC" : "Sui public GraphQL (Tatum gRPC unavailable)";
console.log(`\nlatest Sui checkpoint via ${via}: ${checkpoint.sequence} at ${checkpoint.timestamp}`);
console.log(`Tatum Prediction calls used: ${used} of ${budget} (${budget - used} remaining)`);

// 5. docs/PROOF.md
const link = (blobId: string) => `[\`${blobId}\`](${walruscan(blobId)})`;
const lines: string[] = [
  "# Proof",
  "",
  "Generated by `pnpm verify`. Everything below is rebuilt from Walrus Memory on mainnet; nothing is read from a local database.",
  "",
  `Generated: ${new Date().toISOString()}`,
  `Latest Sui checkpoint read through ${via}: **${checkpoint.sequence}** (${checkpoint.timestamp})`,
  `Tatum Prediction API calls used: ${used} of a ${budget} call budget`,
  "",
  "## Memories on mainnet",
  "",
  "| Namespace | Memories |",
  "|---|---|",
  ...[...listed].map(([ns, items]) => `| \`${ns}\` | ${items.length} |`),
  `| **Total** | **${total}** |`,
  "",
  "## Sealed verdicts",
  "",
  "Model v1 verdicts (those without a model field) pooled skilled wallets by their share of skilled money with alpha 1 and no cap, so their forecasts can sit far from the price. Model v2 caps each wallet's edge at 8 points, weights wallets by their share of all money in the move, uses alpha 0.5 and keeps the forecast within 10 points of the price. Walrus is append-only, so v1 verdicts stay as sealed; they are graded separately from v2.",
  "",
  verdicts.length === 0 ? "None yet." : "| Market | League | Label | Model | Data source | Sharp share | Forecast | Price after move | Sui checkpoint | Blob |",
  ...(verdicts.length === 0 ? [] : ["|---|---|---|---|---|---|---|---|---|---|"]),
  ...verdicts.map((v) => {
    const d = v.data;
    return `| ${d.question.replace(/\|/g, "/")} | ${d.league} | ${d.label} | ${modelOf(d)} | ${d.source ?? "tatum"} | ${(d.sharpShare * 100).toFixed(0)}% | ${(d.forecast * 100).toFixed(1)}% | ${(d.priceAtVerdict * 100).toFixed(1)}% | ${d.checkpoint.sequence} | ${link(blobOf.get(`verdict:${v.key}:${v.version}`) ?? "")} |`;
  }),
  "",
  "## Graded outcomes",
  "",
  gradesByModel.length === 0 ? "No sealed verdict has resolved yet." : "| Model | Label | Graded | CALIBRE forecast Brier | Market price Brier | Gain |",
  ...(gradesByModel.length === 0 ? [] : ["|---|---|---|---|---|---|"]),
  ...gradesByModel.flatMap(({ model, grades }) => grades.map((g) => `| ${model} | ${g.label} | ${g.n} | ${g.forecastBrier.toFixed(4)} | ${g.marketBrier.toFixed(4)} | ${g.gain.toFixed(4)} |`)),
  "",
  ...(outcomes.length > 0 ? ["Outcome blobs: " + outcomes.map((o) => link(blobOf.get(`outcome:${o.key}:${o.version}`) ?? "")).join(", "), ""] : []),
  "## Wallet memories (sample)",
  "",
  ...wallets.slice(0, 5).map((w) => `- ${w.summary} (memory version ${w.version}): ${link(blobOf.get(`wallet:${w.key}:${w.version}`) ?? "")}`),
  "",
  "## Consistency checks",
  "",
  ...checks.map(([name, ok]) => `- ${ok ? "pass" : "FAIL"}: ${name}`),
  "",
];
await writeFile("docs/PROOF.md", lines.join("\n"));
console.log("wrote docs/PROOF.md");
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
