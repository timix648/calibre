import Link from "next/link";
import { PageTitle } from "@/components/ui";

export default function NotFound() {
  return (
    <div>
      <PageTitle title="Not found" sub="That page does not exist, or that verdict is not in the exported data." />
      <Link href="/moves" className="text-accent underline">See sealed verdicts</Link>
    </div>
  );
}
