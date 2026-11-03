import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  agentRules: false,
  // The workspace packages are TypeScript sources; Next compiles them with the app.
  transpilePackages: ["@calibre/core", "@calibre/public-data"],
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default config;
