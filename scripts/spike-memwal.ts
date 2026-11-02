// Day-0 spike: write one memory to Walrus Memory MAINNET and recall it.
import { MemWal } from "@mysten-incubation/memwal";
import { need } from "./env.js";

const memwal = MemWal.create({
  key: need("MEMWAL_PRIVATE_KEY"),
  accountId: need("MEMWAL_ACCOUNT_ID"),
  serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  namespace: "dev-calibre-spike",
});

console.log("health:", await memwal.health());

const text = `[cal1|spike|hello|v1] {"note":"CALIBRE day-0 spike","at":"${new Date().toISOString()}"}`;
const t0 = Date.now();
const saved = await memwal.rememberAndWait(text);
console.log(`remembered in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, saved);
console.log(`Walruscan: https://walruscan.com/mainnet/blob/${saved.blob_id}`);

const { results } = await memwal.recall({
  query: "CALIBRE day-0 spike",
  limit: 3,
  scoringWeights: { semantic: 1, recency: 0.5, recencyHalfLifeDays: 30 },
});
console.log("recall:", results.map((r) => ({ blob_id: r.blob_id, distance: r.distance.toFixed(3), text: r.text.slice(0, 80) })));
