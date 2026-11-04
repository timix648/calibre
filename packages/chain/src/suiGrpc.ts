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

export const SUI_PUBLIC_GRAPHQL = "https://graphql.mainnet.sui.io/graphql";

/** The latest Sui mainnet checkpoint from Mysten's public GraphQL endpoint: the fallback when Tatum's gateway is unavailable. */
export async function latestCheckpointPublic(url = SUI_PUBLIC_GRAPHQL, fetchImpl: typeof fetch = fetch): Promise<CheckpointRef> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: "{ checkpoint { sequenceNumber digest timestamp } }" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Sui public GraphQL HTTP ${res.status}`);
  const body = (await res.json()) as { data?: { checkpoint?: { sequenceNumber?: number | string; digest?: string; timestamp?: string } } };
  const cp = body.data?.checkpoint;
  if (cp?.sequenceNumber === undefined) throw new Error("Sui public GraphQL returned no checkpoint");
  return { sequence: String(cp.sequenceNumber), digest: cp.digest ?? null, timestamp: cp.timestamp ?? null };
}

export type CheckpointSource = "tatum-grpc" | "sui-public-graphql";

/** The latest checkpoint via Tatum gRPC, falling back to Sui's public GraphQL; the result says which one answered. */
export async function anchorCheckpoint(
  client: SuiGrpcClient,
  fallback: () => Promise<CheckpointRef> = () => latestCheckpointPublic(),
): Promise<CheckpointRef & { source: CheckpointSource; fallbackReason?: string }> {
  try {
    return { ...(await latestCheckpoint(client)), source: "tatum-grpc" };
  } catch (e) {
    const reason = `Tatum Sui gRPC: ${(e as Error).message}`;
    return { ...(await fallback()), source: "sui-public-graphql", fallbackReason: reason };
  }
}
