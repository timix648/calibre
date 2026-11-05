// Checks Tatum's market data on whatever Polymarket market is busiest right now (about 300 credits): price history and trades.
//   pnpm exec tsx scripts/tatum-live-check.ts
// Tatum has returned empty history and trades for active markets before; this shows whether it is answering with real data today.
import "./env.js";
import { PredictionClient } from "../packages/chain/src/index.js";

const g = (await (await fetch("https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=3")).json()) as
  { conditionId: string; question: string; volume24hr?: number }[];
const api = new PredictionClient(process.env.TATUM_API_KEY ?? "", { maxRetries: 0 });
const end = new Date();
const start = new Date(end.getTime() - 2 * 3_600_000);
for (const m of g.slice(0, 1)) {
  console.log(`market: "${m.question.slice(0, 60)}" (24 h volume $${Math.round(m.volume24hr ?? 0).toLocaleString("en-US")})`);
  try {
    const c = await api.marketHistory(m.conditionId, { interval: "5m", start: start.toISOString(), end: end.toISOString() });
    console.log(`${c.length > 0 ? "OK  " : "FAIL"} history: ${c.length} five-minute candles over the last 2 hours`);
  } catch (e) { console.log(`FAIL history: ${(e as Error).message.slice(0, 140)}`); }
  try {
    const t = await api.marketTrades(m.conditionId, { limit: 100 });
    console.log(`${t.data.length > 0 ? "OK  " : "FAIL"} trades: ${t.data.length} fills, newest ${t.data[0]?.timestamp ?? "n/a"}`);
  } catch (e) { console.log(`FAIL trades: ${(e as Error).message.slice(0, 140)}`); }
}
process.exit(0);
