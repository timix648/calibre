import { apiError, apiOk, clientKey, preflight } from "@/lib/api";
import { refFromRequest, runMarketXray } from "@/lib/xray-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = preflight;

/**
 * Market X-ray. `[ref]` is a Polymarket event or market slug, a polymarket.com URL (URL-encoded), or a condition id.
 * `?market=<market-slug>` picks a market inside an event.
 */
export async function GET(request: Request, ctx: { params: Promise<{ ref: string }> }) {
  const { ref } = await ctx.params;
  const market = new URL(request.url).searchParams.get("market");
  const res = await runMarketXray(refFromRequest(ref, market), clientKey(request));
  if (!res.ok) return apiError(res.status, res.code, res.error, res.retryAfter);
  // A partial result is cached for under a minute so the audits still running can land.
  return apiOk({ cached: res.cached, result: res.result }, res.result.complete ? 600 : 30);
}
