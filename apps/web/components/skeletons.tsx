"use client";

import { useEffect, useState } from "react";

/** A pulsing placeholder block. */
export function Bone({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-panel-2 ${className}`} />;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div aria-hidden className={`plate ${className}`}>{children}</div>;
}

/** The live X-ray routes take a while. This says so, counts the seconds and shows an indeterminate bar. */
export function LoadingNote({ what, usually }: { what: string; usually: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="plate px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-fg">{what}</p>
        <p className="num text-xs text-faint">{seconds} s · usually {usually}</p>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-panel-2">
        <div className="indeterminate h-full w-1/3 rounded-full bg-accent/70" />
      </div>
    </div>
  );
}

/** Shaped like a finished wallet X-ray: the label card, the edge charts, the sniping meter. */
export function WalletSkeleton() {
  return (
    <div className="space-y-6">
      <Panel>
        <div className="flex items-center gap-3"><Bone className="h-4 w-12" /><Bone className="h-7 w-40 rounded-full" /></div>
        <Bone className="mt-5 h-7 w-full max-w-xl" />
        <Bone className="mt-2 h-7 w-2/3" />
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i}><Bone className="h-3 w-20" /><Bone className="mt-2 h-6 w-24" /></div>)}
        </div>
      </Panel>
      <Panel>
        <Bone className="h-5 w-48" />
        <div className="mt-5 space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[11rem_1fr] sm:gap-6">
              <div><Bone className="h-4 w-24" /><Bone className="mt-2 h-3 w-36" /></div>
              <Bone className="h-14 w-full max-w-[26rem]" />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/** Shaped like a finished market X-ray: the move stats, the gauge, the takers. */
export function MarketSkeleton() {
  return (
    <div className="space-y-6">
      <div><Bone className="h-7 w-3/4" /><Bone className="mt-2 h-4 w-48" /></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Panel key={i} className="!p-4"><Bone className="h-3 w-16" /><Bone className="mt-2 h-6 w-24" /><Bone className="mt-2 h-3 w-20" /></Panel>)}
      </div>
      <Panel>
        <Bone className="h-5 w-32" />
        <div className="mt-5 grid items-center gap-6 sm:grid-cols-[auto_1fr]">
          <div className="mx-auto h-[9.5rem] w-[15rem] animate-pulse rounded-t-full bg-panel-2" aria-hidden />
          <div className="space-y-3"><Bone className="h-4 w-full" /><Bone className="h-4 w-5/6" /><Bone className="h-4 w-2/3" /></div>
        </div>
      </Panel>
      <Panel>
        <Bone className="h-5 w-36" />
        <div className="mt-4 space-y-3">
          {[0, 1, 2, 3].map((i) => <div key={i} className="flex items-center justify-between gap-4"><Bone className="h-5 w-28" /><Bone className="h-5 w-20" /><Bone className="h-6 w-32 rounded-full" /></div>)}
        </div>
      </Panel>
    </div>
  );
}
