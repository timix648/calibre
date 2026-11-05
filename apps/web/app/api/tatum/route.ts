import { tatumStatus } from "@/lib/tatum";

export const dynamic = "force-dynamic";

/** Whether this server instance can use Tatum right now, and the credits it has spent today (never the key itself). */
export function GET() {
  return Response.json({ ok: true, tatum: tatumStatus() }, { headers: { "Cache-Control": "no-store" } });
}
