"use client";

import { useEffect, useRef, useState } from "react";

type Options = {
  duration?: number;
  active?: boolean;
};

/**
 * Animate a number from 0 → target with an easeOutCubic curve.
 * Starts at 0 on both server and client (no hydration mismatch); the
 * animation only runs after mount. Honors prefers-reduced-motion.
 */
export function useCountUp(target: number, { duration = 1500, active = true }: Options = {}) {
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setValue(target);
      return;
    }

    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);

  return value;
}
