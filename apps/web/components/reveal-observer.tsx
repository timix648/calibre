"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const SELECTOR = "[data-reveal]:not(.is-in), [data-stagger]:not(.is-in)";

/**
 * Brings `[data-reveal]` and `[data-stagger]` elements into view as they scroll in. The hidden state only applies once this
 * has run (it adds `reveal-ready` to <html>), so without JavaScript every section simply shows. Content that renders later
 * (an X-ray that finishes loading) is picked up by a mutation observer, so nothing can stay hidden.
 */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    const take = (els: Iterable<HTMLElement>) => {
      const fold = window.innerHeight * 0.92;
      for (const el of els) {
        if (el.getBoundingClientRect().top < fold) el.classList.add("is-in");
        else io.observe(el);
      }
    };
    take(document.querySelectorAll<HTMLElement>(SELECTOR));
    const mo = new MutationObserver((records) => {
      const found: HTMLElement[] = [];
      for (const r of records) for (const n of r.addedNodes) {
        if (!(n instanceof HTMLElement)) continue;
        if (n.matches(SELECTOR)) found.push(n);
        found.push(...n.querySelectorAll<HTMLElement>(SELECTOR));
      }
      if (found.length) take(found);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    document.documentElement.classList.add("reveal-ready");
    return () => { io.disconnect(); mo.disconnect(); };
  }, [pathname]);
  return null;
}
