import * as React from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Animates a number from its previous value to `target` with a plain rAF
 * ease-out. No dependencies, and instant when the user asks for reduced
 * motion.
 */
export function useCountUp(target: number, durationMs = 700, from?: number) {
  const reduced = prefersReducedMotion();
  const [value, setValue] = React.useState(() => (reduced ? target : (from ?? target)));
  const fromRef = React.useRef(from ?? target);
  const rafRef = React.useRef(0);

  React.useEffect(() => {
    if (reduced || durationMs <= 0) {
      fromRef.current = target;
      setValue(target);
      return;
    }
    const start = performance.now();
    const origin = fromRef.current;
    const delta = target - origin;
    if (delta === 0) {
      setValue(target);
      return;
    }

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + delta * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, reduced]);

  return value;
}
