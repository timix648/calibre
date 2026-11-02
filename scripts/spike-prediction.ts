// Day-0 spike: can we list resolved sports markets on Tatum's Prediction Markets API,
// and how is the outcome represented? Prints shapes, not just data.
import { need } from "./env.js";

const BASE = "https://api.tatum.io/v4/data/prediction";
const key = need("TATUM_API_KEY");

async function get(path: string): Promise<unknown> {
  const res = await fetch(BASE + path, { headers: { "x-api-key": key } });
  const text = await res.text();
  console.log(`\nGET ${path} -> ${res.status}`);
  if (!res.ok) { console.log(text.slice(0, 400)); return null; }
  return JSON.parse(text);
}

function shape(x: unknown, depth = 0): unknown {
  if (Array.isArray(x)) return x.length ? [shape(x[0], depth + 1), `…${x.length} items`] : [];
  if (x && typeof x === "object" && depth < 3) {
    return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return typeof x === "object" ? "{…}" : x;
}

// sort accepts: volume_desc | liquidity_desc | endingSoon | newest. Events list markets as IDs (condition ids).
const events = (await get(`/events?platform=polymarket&status=closed&category=SPORTS&limit=3&sort=newest`)) as any;
if (events) console.log(JSON.stringify(shape(events), null, 2).slice(0, 2000));

// Market detail carries the resolution: data.resolution = { outcome, resolvedAt, source }.
const marketId: string | undefined = events?.data?.[0]?.markets?.[0];
if (marketId) {
  const m = (await get(`/markets/${marketId}`)) as any;
  console.log("resolution:", m?.data?.resolution, "outcomes:", m?.data?.outcomes?.map((o: any) => o.name));
}

// Top traders take only category (no period). Their trades include conditionId, side, price, size, outcome.
const top = (await get(`/top-traders?category=SPORTS`)) as any;
const wallet: string | undefined = top?.data?.[0]?.proxyWallet;
if (wallet) {
  const trades = await get(`/wallets/${wallet}/trades?limit=2`);
  if (trades) console.log(JSON.stringify(shape(trades), null, 2).slice(0, 1500));
}
