import { handlePaidXray, paidPreflight } from "@/lib/paid-xray";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const OPTIONS = paidPreflight;

/**
 * Paid wallet X-ray for trading agents: 0.01 USDC per call over the Machine Payments Protocol on Sui. The same JSON as
 * `/api/xray/wallet/[address]` plus a `receipt` with the payment digest. Returns 503 until MPP_RECIPIENT and MPP_SECRET_KEY are set.
 */
export async function GET(request: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  return handlePaidXray(request, address);
}
