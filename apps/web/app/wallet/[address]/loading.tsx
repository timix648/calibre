import { LoadingNote, WalletSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingNote what="Opening the wallet X-ray" usually="3 to 10 s" />
      <WalletSkeleton />
    </div>
  );
}
