import { apiError, apiOk, clientKey, preflight } from "@/lib/api";
import { runHandleLookup } from "@/lib/xray-service";

export const dynamic = "force-dynamic";

export const OPTIONS = preflight;

/** Resolves a Polymarket `@username` to the wallet address behind it (exact name match through the public profile search). */
export async function GET(request: Request, ctx: { params: Promise<{ handle: string }> }) {
  const { handle } = await ctx.params;
  const res = await runHandleLookup(decodeURIComponent(handle), clientKey(request));
  if (!res.ok) return apiError(res.status, res.code, res.error, res.retryAfter);
  return apiOk({ address: res.address, name: res.name }, 3600);
}
