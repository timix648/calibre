import type { Metadata } from "next";
import { MarketXrayView } from "@/components/market-xray-view";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Market X-ray", robots: { index: false } };

export default async function MarketPage({
  params, searchParams,
}: { params: Promise<{ ref: string }>; searchParams: Promise<{ market?: string | string[] }> }) {
  const { ref } = await params;
  const { market } = await searchParams;
  const marketSlug = Array.isArray(market) ? market[0] : market;
  return (
    <div className="space-y-6">
      <PageTitle
        title="Market X-ray"
        sub="Who pushed the latest move in this market, and how much of that money came from traders with a proven losing record."
      />
      <MarketXrayView refParam={decodeURIComponent(ref)} marketParam={marketSlug ?? null} />
    </div>
  );
}
