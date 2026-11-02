// Spike: how often do prediction-market prices "shock" (big fast moves), and how often do those moves hold?
// Measures the base rate a memory of past shocks would need to beat.
import { need } from "./env.js";

const BASE = "https://api.tatum.io/v4/data/prediction";
const key = need("TATUM_API_KEY");
const DAYS = Number(process.env.SHOCK_DAYS ?? 14);
const JUMP = Number(process.env.SHOCK_JUMP ?? 0.08);     // 8 points
const WINDOW_MIN = 60;                                     // within one hour
const HORIZON_MIN = 360;                                   // judged six hours later

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(path: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(BASE + path, { headers: { "x-api-key": key } });
    if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
    await sleep(350); // stay under ~3 req/s
    return res.json();
  }
  throw new Error("rate limited: " + path);
}

interface Candle { timestamp: string; close: number; volume: number }
const end = new Date();
const start = new Date(end.getTime() - DAYS * 86_400_000);

const markets: { id: string; title: string; cat: string }[] = [];
for (const [cat, status, sort, limit] of [
  ["SPORTS", "closed", "newest", 30], ["SPORTS", "active", "volume_desc", 10],
  ["POLITICS", "active", "volume_desc", 10], ["CRYPTO", "active", "volume_desc", 10],
] as const) {
  const ev = await get(`/events?platform=polymarket&status=${status}&category=${cat}&limit=${limit}&sort=${sort}`);
  for (const e of ev.data ?? []) for (const m of (e.markets ?? []).slice(0, 2)) markets.push({ id: m, title: e.title, cat });
}

// The API caps 15m candles at 7 days per request, so fetch in chunks.
async function candles15m(id: string): Promise<Candle[]> {
  const out: Candle[] = [];
  for (let t = start.getTime(); t < end.getTime(); t += 7 * 86_400_000) {
    const s = new Date(t), e = new Date(Math.min(end.getTime(), t + 7 * 86_400_000));
    const h = await get(`/markets/${id}/history?interval=15m&start=${s.toISOString()}&end=${e.toISOString()}`);
    out.push(...(h.data?.candles ?? []));
  }
  return out;
}
console.log(`markets: ${markets.length}, window ${DAYS}d, jump >= ${JUMP * 100}pts in ${WINDOW_MIN}m, judged at +${HORIZON_MIN / 60}h`);

let shocks = 0, held = 0, reverted = 0;
const examples: string[] = [];
for (const m of markets) {
  let candles: Candle[] = [];
  try {
    candles = await candles15m(m.id);
  } catch (e) { console.log("skip", m.title, (e as Error).message.slice(0, 80)); continue; }
  const step = 15, w = WINDOW_MIN / step, hz = HORIZON_MIN / step;
  let i = w;
  while (i < candles.length - hz) {
    const from = candles[i - w]!.close, to = candles[i]!.close, delta = to - from;
    if (Math.abs(delta) >= JUMP && from > 0.03 && from < 0.97) {
      const later = candles[i + hz]!.close;
      const kept = (later - from) / delta; // 1 = fully held, 0 = fully reverted
      shocks++;
      if (kept >= 0.5) held++; else reverted++;
      if (examples.length < 8) examples.push(`${m.cat} | ${m.title.slice(0, 50)} | ${from.toFixed(2)}->${to.toFixed(2)} @${candles[i]!.timestamp.slice(5, 16)} | +6h ${later.toFixed(2)} kept ${(kept * 100).toFixed(0)}%`);
      i += hz; // don't double count the same move
    } else i++;
  }
}
console.log(`\nshocks: ${shocks}, held: ${held} (${shocks ? ((held / shocks) * 100).toFixed(0) : 0}%), reverted: ${reverted}`);
console.log(examples.join("\n"));
