"use client";

import { ErrorPanel } from "@/components/error-panel";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-8">
      <ErrorPanel code="unknown" message={error.digest ? `Reference ${error.digest}` : undefined} onRetry={reset} />
    </div>
  );
}
