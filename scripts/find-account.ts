// Find the MemWalAccount object ID for our delegate key from DelegateKeyAdded events.
// Package ID comes from the relayer's public /config. gRPC has no event search, so this one-off
// lookup uses Sui's public GraphQL endpoint.
import { need } from "./env.js";

const agentB64 = Buffer.from(need("MEMWAL_AGENT_ID").replace(/^0x/, ""), "hex").toString("base64");
const relayer = process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz";
const { packageId } = (await (await fetch(`${relayer}/config`)).json()) as { packageId: string };

let before: string | null = null;
for (let page = 0; page < 40; page++) {
  const cursor = before ? `, before: "${before}"` : "";
  const query = `{ events(filter: { type: "${packageId}::account::DelegateKeyAdded" }, last: 50${cursor}) {
    pageInfo { hasPreviousPage startCursor } nodes { contents { json } } } }`;
  const res: Response = await fetch("https://graphql.mainnet.sui.io/graphql", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }),
  });
  const events: any = ((await res.json()) as any).data.events;
  const hit = events.nodes.map((n: any) => n.contents.json).find((j: any) => j.public_key === agentB64);
  if (hit) {
    console.log(`MEMWAL_ACCOUNT_ID=${hit.account_id}  (key label: ${hit.label})`);
    process.exit(0);
  }
  if (!events.pageInfo.hasPreviousPage) break;
  before = events.pageInfo.startCursor;
}
console.log("Not found. Copy the account ID from the Walrus Memory dashboard instead.");
