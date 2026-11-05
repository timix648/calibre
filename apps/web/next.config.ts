import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // The workspace packages are TypeScript sources; Next compiles them with the app.
  transpilePackages: ["@calibre/core", "@calibre/public-data", "@calibre/chain"],
  // Tatum's Sui gateway speaks native gRPC; grpc-js runs as a normal Node module on the server, not bundled.
  serverExternalPackages: ["@grpc/grpc-js", "@protobuf-ts/grpc-transport"],
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default config;
