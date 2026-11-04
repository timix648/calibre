import { LoadingNote, MarketSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingNote what="Opening the market X-ray" usually="5 to 25 s" />
      <MarketSkeleton />
    </div>
  );
}
