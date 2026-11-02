// Day-0 spike: read Sui mainnet through Tatum's native gRPC gateway.
import { tatumSuiClient } from "../packages/chain/src/index.js";
import { need } from "./env.js";

const client = tatumSuiClient(need("TATUM_API_KEY"));

// No checkpoint id selected = latest checkpoint.
const { response } = await client.ledgerService.getCheckpoint({ checkpointId: { oneofKind: undefined } });
console.log("Tatum Sui gRPC OK. Latest checkpoint:", response.checkpoint?.sequenceNumber?.toString());
