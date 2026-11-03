import { fileURLToPath } from "node:url";

// Scripts read and write relative paths (.cache, docs, .env); run them from the repository root
// no matter where pnpm started the process (pnpm --filter runs inside apps/worker).
process.chdir(fileURLToPath(new URL("../../../..", import.meta.url)));
