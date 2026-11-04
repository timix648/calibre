import { apiError, apiOk, clientKey, preflight } from "@/lib/api";
import { runWalletXray } from "@/lib/xray-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = preflight;

/** Wallet X-ray: the audit plus the label (proven losing record, mostly sniping, too early, positive record, no proven edge). */
export async function GET(request: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const res = await runWalletXray(address, clientKey(request));
  if (!res.ok) return apiError(res.status, res.code, res.error, res.retryAfter);
  return apiOk({ cached: res.cached, result: res.result });
}
