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
