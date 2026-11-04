// How much data CALIBRE's studies and index actually processed, written to apps/web/data/scale.json.
//   pnpm exec tsx scripts/scale-stats.ts <square-replay.jsonl> <wide-all.json> [wallets.json]
// Every figure is a plain sum over the study outputs; the market volume is Polymarket's own volume figure from the free Gamma API
// for each replayed market. Nothing is estimated or extrapolated.
import { readFileSync, writeFileSync } from "node:fs";

const [replayFile, wideFile, indexFile = ".cache/index/wallets.json"] = process.argv.slice(2);
if (!replayFile || !wideFile) throw new Error("usage: scale-stats.ts <square-replay.jsonl> <wide-all.json> [wallets.json]");

interface Move { market: string; league: string; alignedUsd?: number; takers?: { wallet: string }[] }
const moves = readFileSync(replayFile, "utf8").trim().split("\n").map((l) => JSON.parse(l) as Move);
const markets = [...new Set(moves.map((m) => m.market))];
const takers = new Set(moves.flatMap((m) => (m.takers ?? []).map((t) => t.wallet)));
const pushingUsd = moves.reduce((s, m) => s + (m.alignedUsd ?? 0), 0);

let volumeUsd = 0;
let volumeMarkets = 0;
for (let i = 0; i < markets.length; i += 40) {
  const q = markets.slice(i, i + 40).map((c) => `condition_ids=${c}`).join("&");
  const res = await fetch(`https://gamma-api.polymarket.com/markets?closed=true&limit=100&${q}`, { signal: AbortSignal.timeout(20_000) });
  for (const m of (await res.json()) as { volumeNum?: number; volume?: string }[]) {
    const v = Number(m.volumeNum ?? m.volume ?? 0);
    if (Number.isFinite(v)) { volumeUsd += v; volumeMarkets++; }
  }
}

const wide = JSON.parse(readFileSync(wideFile, "utf8")) as { rows: { n: number }[] };
const index = JSON.parse(readFileSync(indexFile, "utf8")) as { wallet: string; league: string; n: number }[];

const scale = {
  generatedAt: new Date().toISOString(),
  replay: {
    markets: markets.length,
    marketsWithVolume: volumeMarkets,
    marketVolumeUsd: Math.round(volumeUsd),
    leagues: new Set(moves.map((m) => m.league)).size,
    moves: moves.length,
    pushingUsd: Math.round(pushingUsd),
    walletsLabeled: takers.size,
  },
  wideStudy: { wallets: wide.rows.length, scoredBets: wide.rows.reduce((s, r) => s + r.n, 0) },
  index: { rows: index.length, wallets: new Set(index.map((r) => r.wallet)).size, leagues: new Set(index.map((r) => r.league)).size, scoredBets: index.reduce((s, r) => s + r.n, 0) },
};
writeFileSync("apps/web/data/scale.json", JSON.stringify(scale, null, 2) + "\n");
console.log(JSON.stringify(scale, null, 2));
