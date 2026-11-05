import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { InMemoryDigestStore, USDC, sui, type DigestStore } from "@suimpp/mpp/server";
import { Receipt } from "mppx";
import { Mppx } from "mppx/server";
import { isAddress } from "@calibre/public-data";
import { CORS_HEADERS, apiError, clientKey } from "./api";
import { confirmPaymentViaTatum } from "./tatum";
import { runWalletXray, type WalletXrayResponse } from "./xray-service";

/** What one paid call costs, in USDC (a decimal string: the protocol never uses floating point for money). */
export const PRICE_USDC = "0.01";

/** The paid route is read by agents, mostly server to server, but browsers may call it too: let the payment headers through. */
export const PAID_CORS_HEADERS: Record<string, string> = {
  ...CORS_HEADERS,
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Payment-Receipt",
};

export const paidPreflight = (): Response => new Response(null, { status: 204, headers: PAID_CORS_HEADERS });

// ---------------------------------------------------------------------------------------------------------------------
// Configuration, read from the environment on every request (never at import time, so a deploy can add it later)

export interface PaymentConfig {
  /** Sui address that receives the USDC (MPP_RECIPIENT). */
  recipient: string;
  /** Secret that binds payment challenges to their contents (MPP_SECRET_KEY, at least 32 bytes). */
  secretKey: string;
  network: "mainnet" | "testnet";
  /** Optional gRPC endpoint the server verifies payments through (MPP_RPC_URL); the public Sui fullnode when absent. */
  rpcUrl?: string;
  /** Optional file that keeps spent digests across restarts (MPP_DIGEST_FILE). */
  digestFile?: string;
}

export type ConfigResult = { ok: true; config: PaymentConfig } | { ok: false; message: string };

type Env = Record<string, string | undefined>;

const SUI_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/** Reads the payment settings. Missing or malformed settings come back as one plain-English message, never an exception. */
export function readPaymentConfig(env: Env): ConfigResult {
  const recipient = env.MPP_RECIPIENT?.trim();
  if (!recipient) {
    return { ok: false, message: "Paid X-rays are not configured on this deployment: MPP_RECIPIENT (the Sui address that receives the USDC) is not set." };
  }
  if (!SUI_ADDRESS.test(recipient)) {
    return { ok: false, message: "Paid X-rays are not configured correctly: MPP_RECIPIENT is not a Sui address (0x followed by up to 64 hex digits)." };
  }
  const secretKey = env.MPP_SECRET_KEY?.trim();
  if (!secretKey) {
    return { ok: false, message: "Paid X-rays are not configured on this deployment: MPP_SECRET_KEY is not set (generate one with: openssl rand -base64 32)." };
  }
  if (Buffer.byteLength(secretKey) < 32) {
    return { ok: false, message: "Paid X-rays are not configured correctly: MPP_SECRET_KEY must be at least 32 bytes (generate one with: openssl rand -base64 32)." };
  }
  const network = env.MPP_NETWORK?.trim().toLowerCase() === "testnet" ? "testnet" : "mainnet";
  const rpcUrl = env.MPP_RPC_URL?.trim();
  const digestFile = env.MPP_DIGEST_FILE?.trim();
  return { ok: true, config: { recipient, secretKey, network, ...(rpcUrl ? { rpcUrl } : {}), ...(digestFile ? { digestFile } : {}) } };
}

// ---------------------------------------------------------------------------------------------------------------------
// Replay protection

/**
 * Remembers spent payment digests in a JSON file, so a restarted server still refuses a digest it has already served.
 * Fine for one machine. A serverless platform has no durable disk: there, give the route a shared store (Redis, a KV, a
 * database) by implementing the same two methods, `has` and `set`.
 */
export class FileDigestStore implements DigestStore {
  private spent: Set<string> | null = null;
  constructor(private readonly file: string) {}

  private async load(): Promise<Set<string>> {
    if (this.spent) return this.spent;
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
      this.spent = new Set(Array.isArray(parsed) ? parsed.filter((d): d is string => typeof d === "string") : []);
    } catch {
      this.spent = new Set();
    }
    return this.spent;
  }

  async has(digest: string): Promise<boolean> {
    return (await this.load()).has(digest);
  }

  async set(digest: string): Promise<void> {
    const spent = await this.load();
    spent.add(digest);
    await mkdir(path.dirname(path.resolve(this.file)), { recursive: true });
    await writeFile(this.file, JSON.stringify([...spent]));
  }
}

/**
 * One process-wide store per file (or one in-memory store). The in-memory default forgets spent digests when the instance
 * recycles and is not shared between instances, so on Vercel it is best effort: set MPP_DIGEST_FILE on a machine with a
 * disk, or supply a shared store, before real money moves.
 */
const stores = new Map<string, DigestStore>();
export function digestStoreFor(config: Pick<PaymentConfig, "digestFile">): DigestStore {
  const key = config.digestFile ?? "memory";
  let store = stores.get(key);
  if (!store) {
    store = config.digestFile ? new FileDigestStore(config.digestFile) : new InMemoryDigestStore();
    stores.set(key, store);
  }
  return store;
}

// ---------------------------------------------------------------------------------------------------------------------
// The payment handler

/** The part of an mppx server this route uses, so a test can stand in for it. */
export interface Payments {
  charge(options: { amount: string; description?: string }): (request: Request) => Promise<
    | { status: 402; challenge: Response }
    | { status: 200; withReceipt: (response: Response) => Response }
  >;
}

const instances = new Map<string, Payments>();

/** An mppx server for these settings, built once and reused (it holds the digest store). */
export function paymentsFor(config: PaymentConfig, store: DigestStore = digestStoreFor(config)): Payments {
  const key = JSON.stringify([config.recipient, config.secretKey, config.network, config.rpcUrl ?? "", config.digestFile ?? ""]);
  let payments = instances.get(key);
  if (!payments) {
    payments = Mppx.create({
      methods: [
        sui({
          currency: USDC,
          recipient: config.recipient,
          network: config.network,
          ...(config.rpcUrl ? { rpcUrl: config.rpcUrl } : {}),
          store,
        }),
      ],
      secretKey: config.secretKey,
    }) as unknown as Payments;
    instances.set(key, payments);
  }
  return payments;
}

export interface PaidXrayDeps {
  env?: Env;
  runXray?: (address: string, client: string) => Promise<WalletXrayResponse>;
  payments?: Payments;
  /** Reads the settled payment back through Tatum's Sui gRPC; null when Tatum cannot answer. */
  confirm?: (digest: string) => Promise<Awaited<ReturnType<typeof confirmPaymentViaTatum>>>;
}

/** The payment transaction as Tatum's Sui gRPC reports it, retried once because a just-settled transaction may still be indexing. */
async function tatumConfirmation(digest: string, confirm: NonNullable<PaidXrayDeps["confirm"]>) {
  const first = await confirm(digest);
  if (first) return first;
  await new Promise((r) => setTimeout(r, 1500));
  return confirm(digest);
}

/** A Payment credential rides in the Authorization header. */
const hasCredential = (request: Request): boolean => /^Payment\s/i.test(request.headers.get("authorization") ?? "");

function paid(body: Record<string, unknown>, status = 200): Response {
  return Response.json(body, { status, headers: { ...PAID_CORS_HEADERS, "Cache-Control": "no-store" } });
}

/** The digest of a settled payment, read back from the Payment-Receipt header mppx wrote (the receipt's reference is the Sui digest). */
export function receiptDigest(response: Response): string | null {
  const header = response.headers.get("Payment-Receipt");
  if (!header) return null;
  try {
    return Receipt.deserialize(header).reference;
  } catch {
    return null;
  }
}

/**
 * `GET /api/v1/xray/[address]`: the wallet X-ray for 0.01 USDC per call, paid over the Machine Payments Protocol on Sui.
 * The flow: no credential gets a 402 challenge (nothing is computed); a credential has its X-ray computed first, so a payment
 * is never settled for a call that then fails; then the payment is verified on-chain and the answer is returned with a
 * `receipt` holding the payment digest. The reply is never cached by a CDN.
 */
export async function handlePaidXray(request: Request, address: string, deps: PaidXrayDeps = {}): Promise<Response> {
  const settings = readPaymentConfig(deps.env ?? process.env);
  if (!settings.ok) {
    return Response.json(
      { ok: false, code: "payments_not_configured", error: settings.message },
      { status: 503, headers: { ...PAID_CORS_HEADERS, "Cache-Control": "no-store" } },
    );
  }
  if (!isAddress(address)) {
    return apiError(400, "bad_address", "That is not a wallet address. It should start with 0x and have 40 hex characters. No payment was requested.");
  }

  const runXray = deps.runXray ?? runWalletXray;
  const client = clientKey(request);
  const payments = deps.payments ?? paymentsFor(settings.config);

  let xray: WalletXrayResponse | null = null;
  if (hasCredential(request)) {
    xray = await runXray(address.toLowerCase(), client);
    if (!xray.ok) return apiError(xray.status, xray.code, `${xray.error} The payment was not settled: send the same request again.`, xray.retryAfter);
  }

  const result = await payments.charge({ amount: PRICE_USDC, description: "CALIBRE wallet X-ray" })(request);
  if (result.status === 402) return withCors(result.challenge);

  xray ??= await runXray(address.toLowerCase(), client);
  if (!xray.ok) return withCors(result.withReceipt(apiError(xray.status, xray.code, xray.error, xray.retryAfter)));
  const digest = receiptDigest(result.withReceipt(new Response(null)));
  const tatum = digest ? await tatumConfirmation(digest, deps.confirm ?? confirmPaymentViaTatum).catch(() => null) : null;
  return withCors(
    result.withReceipt(
      paid({
        ok: true,
        cached: xray.cached,
        result: xray.result,
        receipt: digest
          ? {
              method: "sui", digest, amount: PRICE_USDC, currency: "USDC", network: settings.config.network, explorer: `https://suiscan.xyz/${settings.config.network}/tx/${digest}`,
              // Read back through Tatum's Sui gRPC: success and the checkpoint that finalised the payment (null if Tatum could not answer).
              tatum: tatum ? { confirmed: tatum.success, checkpoint: tatum.checkpoint, timestamp: tatum.timestamp, source: tatum.source } : null,
            }
          : null,
      }),
    ),
  );
}

/** Adds the CORS headers to a response the payment library built, and keeps it out of shared caches. */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(PAID_CORS_HEADERS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
