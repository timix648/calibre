"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up from zero the first time it scrolls into view. It is fail-safe: the final value renders on the
 * server and stays until the animation actually starts, and a timer always lands it on the true value, even when the
 * browser pauses animation frames (a background tab, a slow phone, a screenshot tool). People who ask for less motion get
 * the final value with no animation.
 */
export function CountUp({
  value, decimals = 0, prefix = "", suffix = "", compact, duration = 1300, svg = false,
}: {
  value: number; decimals?: number; prefix?: string; suffix?: string; compact?: "B" | "M"; duration?: number; svg?: boolean;
}) {
  const scale = compact === "B" ? 1e9 : compact === "M" ? 1e6 : 1;
  const target = value / scale;
  const format = (v: number) =>
    `${prefix}${v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${compact ?? ""}${suffix}`;
  const final = format(target);
  const [shown, setShown] = useState(final);
  const ref = useRef<HTMLSpanElement & SVGTSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let guard = 0;
    const run = () => {
      let start = -1;
      const tick = (now: number) => {
        if (start < 0) start = now;
        const t = Math.min(1, (now - start) / duration);
        setShown(format(target * (1 - Math.pow(1 - t, 4))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      guard = window.setTimeout(() => { cancelAnimationFrame(raf); setShown(final); }, duration + 400);
    };
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { io.disconnect(); run(); }
    }, { threshold: 0.3 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(guard); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, decimals, prefix, suffix, compact, duration]);

  return svg ? <tspan ref={ref}>{shown}</tspan> : <span ref={ref} aria-label={final}>{shown}</span>;
}
