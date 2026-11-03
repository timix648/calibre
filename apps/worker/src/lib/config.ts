import "./root.js";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { PredictionClient, tatumSuiClient } from "../../../../packages/chain/src/index.js";
import { WalrusMemoryStore } from "../../../../packages/memory/src/index.js";
import { need } from "../../../../scripts/env.js";

/** Every Tatum Prediction client in CALIBRE is created here, so the credit budget always applies. */
export const TATUM_BUDGET_FILE = ".cache/tatum-calls.json";
export const tatumBudget = () => Number(process.env.TATUM_CALL_BUDGET ?? 1500);

export function predictionClient(): PredictionClient {
  return new PredictionClient(need("TATUM_API_KEY"), {
    callBudget: tatumBudget(),
    budgetFile: TATUM_BUDGET_FILE,
    cacheDir: ".cache/tatum",
  });
}

export function suiClient() {
  return tatumSuiClient(need("TATUM_API_KEY"));
}

export function memoryStore(): WalrusMemoryStore {
  return new WalrusMemoryStore({
    key: need("MEMWAL_PRIVATE_KEY"),
    accountId: need("MEMWAL_ACCOUNT_ID"),
    serverUrl: process.env.MEMWAL_SERVER_URL || "https://relayer.memory.walrus.xyz",
  });
}

/** Tatum calls made so far across runs, from the budget file. */
export async function tatumCallsUsed(): Promise<{ used: number; budget: number }> {
  const used = await readJson<{ used: number }>(TATUM_BUDGET_FILE, { used: 0 });
  return { used: used.used, budget: tatumBudget() };
}

/** A Tatum response already on disk, regardless of age (the cache key is the request path). */
export async function tatumCached<T>(path: string): Promise<T | null> {
  try {
    return (JSON.parse(await readFile(`.cache/tatum/${createHash("sha1").update(path).digest("hex")}.json`, "utf8")) as { body: T }).body;
  } catch {
    return null;
  }
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2));
}

/** `--name value` and `--flag` arguments. */
export function cliArgs(argv = process.argv.slice(2)): Map<string, string> {
  const out = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("--")) { out.set(a.slice(2), next); i++; }
    else out.set(a.slice(2), "true");
  }
  return out;
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const INDEX_DIR = ".cache/index";
export const WALLET_INDEX_FILE = `${INDEX_DIR}/wallets.json`;
export const MEMORY_STATE_FILE = `${INDEX_DIR}/memory-state.json`;
export const WORKER_DIR = ".cache/worker";
export const VERDICT_LEDGER_FILE = `${WORKER_DIR}/verdicts.json`;
export const OUTCOME_LEDGER_FILE = `${WORKER_DIR}/outcomes.json`;
export const WATCH_STATE_FILE = `${WORKER_DIR}/watch-state.json`;
