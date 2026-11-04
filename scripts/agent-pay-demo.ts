// A buyer agent that pays for CALIBRE wallet X-rays over MPP on Sui: 0.01 USDC per call, with a hard cap per run.
//   pnpm tsx scripts/agent-pay-demo.ts [--base https://your-site] [--max-calls 5] [--max-price 0.01] [wallet ...]
//
// Environment (never printed):
//   AGENT_SUI_KEY    the buyer's Sui private key in bech32 form (suiprivkey1...), holding Sui USDC and a little SUI for gas
//   AGENT_API_BASE   the site to call (default http://localhost:3000); --base overrides it
//   AGENT_SUI_RPC    optional Sui gRPC endpoint (default the public mainnet fullnode)
//
// It pays only after the server's 402 challenge passes the spend guard (scripts/agent-pay-cap.ts): the price must be at most
// --max-price, the coin must be Sui USDC, and no more than --max-calls payments are made in the run. See docs/AGENT_PAYMENTS.md.
import "./env";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { USDC, sui } from "@suimpp/mpp/client";
import { Receipt } from "mppx";
import { Mppx } from "mppx/client";
import {
  DEFAULT_MAX_PRICE_USDC, SpendCapExceeded, SpendGuard, parseMaxCalls, planWallets, type Challenge,
} from "./agent-pay-cap";

/** The wallet used when none are given: the sample wallet of the site. */
const DEFAULT_WALLETS = ["0x684baa57c338c2549aec0aa3f034f695d72a8409"];
const SUISCAN = "https://suiscan.xyz/mainnet/tx";

function flags(argv: string[]): { options: Map<string, string>; rest: string[] } {
  const options = new Map<string, string>();
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { options.set(a.slice(2), next); i++; } else options.set(a.slice(2), "true");
    } else rest.push(a);
  }
  return { options, rest };
}

function signerFromEnv(): Ed25519Keypair {
  const key = process.env.AGENT_SUI_KEY?.trim();
  if (!key) throw new Error("AGENT_SUI_KEY is not set. Put the buyer's suiprivkey1... in .env (see docs/AGENT_PAYMENTS.md).");
  const { scheme, secretKey } = decodeSuiPrivateKey(key);
  if (scheme !== "ED25519") throw new Error(`AGENT_SUI_KEY must be an Ed25519 key (this one is ${scheme}).`);
  return Ed25519Keypair.fromSecretKey(secretKey);
}

function digestOf(res: Response, body: { receipt?: { digest?: string } | null } | null): string | null {
  const fromBody = body?.receipt?.digest;
  if (fromBody) return fromBody;
  const header = res.headers.get("Payment-Receipt");
  if (!header) return null;
  try { return Receipt.deserialize(header).reference; } catch { return null; }
}

async function main(): Promise<void> {
  const { options, rest } = flags(process.argv.slice(2));
  const maxCalls = parseMaxCalls(options.get("max-calls") ?? process.env.AGENT_MAX_CALLS);
  const maxPrice = options.get("max-price") ?? DEFAULT_MAX_PRICE_USDC;
  const base = (options.get("base") ?? process.env.AGENT_API_BASE ?? "http://localhost:3000").replace(/\/+$/, "");
  const plan = planWallets(rest.length > 0 ? rest : DEFAULT_WALLETS, maxCalls);
  if (plan.invalid.length > 0) console.log(`ignoring entries that are not wallet addresses: ${plan.invalid.join(", ")}`);
  if (plan.skipped.length > 0) console.log(`the cap of ${maxCalls} calls leaves ${plan.skipped.length} wallet(s) out of this run`);
  if (plan.wallets.length === 0) throw new Error("no valid wallet addresses to X-ray");

  const signer = signerFromEnv();
  const client = new SuiGrpcClient({ baseUrl: process.env.AGENT_SUI_RPC?.trim() || "https://fullnode.mainnet.sui.io:443", network: "mainnet" });
  const guard = new SpendGuard(maxCalls, maxPrice, USDC.type);
  // polyfill: false leaves global fetch alone; maxPaymentRetries: 1 means a rejected payment is never paid again by the library.
  const mppx = Mppx.create({ methods: [sui({ client, signer, currency: USDC })], polyfill: false, maxPaymentRetries: 1 });

  console.log(`buyer ${signer.toSuiAddress()}`);
  console.log(`site ${base}; ${plan.wallets.length} call(s) planned; at most ${guard.maxCalls} paid calls and ${guard.ceiling} USDC this run\n`);

  const receipts: { wallet: string; digest: string }[] = [];
  for (const wallet of plan.wallets) {
    const url = `${base}/api/v1/xray/${wallet}`;
    const prepared = await mppx.prepareRequest(url);
    let res = prepared.response;
    if (res.status === 402) {
      if (!prepared.payment) { console.log(`${wallet}: the server asked for payment in a way this agent cannot pay; skipped`); continue; }
      const asked = prepared.payment.challenge.request as unknown as Challenge;
      try {
        guard.approve(asked);
      } catch (e) {
        if (e instanceof SpendCapExceeded) { console.log(`${wallet}: not paid, ${e.message}`); if (guard.callsLeft === 0) break; continue; }
        throw e;
      }
      console.log(`${wallet}: paying ${asked.amount} USDC to ${asked.recipient}`);
      res = await prepared.payment.pay();
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; result?: { xray?: { label?: string }; audit?: { n?: number; overall?: { edge?: number } } }; receipt?: { digest?: string } | null } | null;
    if (res.status !== 200 || !body?.ok) {
      console.log(`${wallet}: HTTP ${res.status}${body?.error ? `, ${body.error}` : ""}`);
      continue;
    }
    const digest = digestOf(res, body);
    const edge = body.result?.audit?.overall?.edge;
    console.log(`${wallet}: ${body.result?.xray?.label ?? "no label"}${edge !== undefined ? `, edge ${(edge * 100).toFixed(1)} pts over ${body.result?.audit?.n ?? 0} bets` : ""}`);
    if (digest) { receipts.push({ wallet, digest }); console.log(`  receipt ${digest}\n  ${SUISCAN}/${digest}`); }
    else console.log("  no receipt digest in the reply");
  }

  console.log(`\npaid calls: ${guard.calls}/${guard.maxCalls}; spent ${guard.spent} USDC (ceiling ${guard.ceiling})`);
  for (const r of receipts) console.log(`${SUISCAN}/${r.digest}  ${r.wallet}`);
}

main().then(() => process.exit(0), (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
