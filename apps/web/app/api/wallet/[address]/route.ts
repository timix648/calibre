import { runWalletAudit } from "@/lib/wallet-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

export async function GET(request: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const res = await runWalletAudit(address, clientKey(request));
  if (!res.ok) {
    return Response.json(
      { ok: false, code: res.code, error: res.error },
      { status: res.status, headers: res.retryAfter ? { "Retry-After": String(res.retryAfter) } : undefined },
    );
  }
  return Response.json(
    { ok: true, cached: res.cached, result: res.result },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=60" } },
  );
}
