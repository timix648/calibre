"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";

// The order of the main sections: moving to one further along slides the page in from the right, going back from the left.
const ORDER = ["/", "/radar", "/record", "/proof", "/method", "/extension", "/agents"];
const rank = (p: string) => {
  if (p === "/") return 0;
  const i = ORDER.findIndex((o) => o !== "/" && p.startsWith(o));
  return i < 0 ? -1 : i;
};

let previous: string | null = null;

/** Next re-mounts a template on every navigation, so each page gets its own entrance. */
export default function Template({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const from = previous;
  let dir = "from-below";
  if (from !== null && from !== pathname) {
    const a = rank(from);
    const b = rank(pathname);
    if (a >= 0 && b >= 0 && a !== b) dir = b > a ? "from-right" : "from-left";
  }
  useEffect(() => { previous = pathname; }, [pathname]);
  return <div className={`page-in ${dir}`}>{children}</div>;
}
