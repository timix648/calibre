import { ChannelCredentials } from "@grpc/grpc-js";
import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { SuiGrpcClient } from "@mysten/sui/grpc";

export const TATUM_SUI_GRPC_HOST = "sui-mainnet-grpc.gateway.tatum.io:443";

/**
 * Sui mainnet client over Tatum's gRPC gateway. The gateway speaks native gRPC (not gRPC-web),
 * so we hand the SDK a grpc-js transport with the API key as call metadata.
 */
export function tatumSuiClient(apiKey: string, host = TATUM_SUI_GRPC_HOST): SuiGrpcClient {
  const transport = new GrpcTransport({
    host,
    channelCredentials: ChannelCredentials.createSsl(),
    meta: { "x-api-key": apiKey },
  });
  return new SuiGrpcClient({ network: "mainnet", transport });
}

export interface CheckpointRef {
  /** Checkpoint sequence number as a decimal string (it is a u64). */
  sequence: string;
  digest: string | null;
  /** ISO time the validators certified the checkpoint. */
  timestamp: string | null;
}

/** The latest Sui mainnet checkpoint, read through Tatum's gRPC gateway. */
export async function latestCheckpoint(client: SuiGrpcClient): Promise<CheckpointRef> {
  const { response } = await client.ledgerService.getCheckpoint({
    checkpointId: { oneofKind: undefined },
    readMask: { paths: ["sequence_number", "digest", "summary.timestamp"] },
  });
  const cp = response.checkpoint;
  if (cp?.sequenceNumber === undefined) throw new Error("Tatum Sui gRPC returned no checkpoint");
  const ts = cp.summary?.timestamp;
  return {
    sequence: cp.sequenceNumber.toString(),
    digest: cp.digest ?? null,
    timestamp: ts?.seconds !== undefined ? new Date(Number(ts.seconds) * 1000 + Math.floor((ts.nanos ?? 0) / 1e6)).toISOString() : null,
  };
}
