import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <div>
      <PageTitle tab="404" title="Not found" sub="That page does not exist, or that verdict is not in the exported data." />
      <Link href="/radar" className="text-accent underline">Open the radar</Link>
    </div>
  );
}
