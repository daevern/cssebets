import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Fits a game's playfield into the exact space between the sticky stats bar
 * and the top of the control dock.
 *
 * The space is fixed — the game scales. Content is measured at its natural
 * size and uniformly scaled (down or up) so every arcade game occupies the
 * same visual envelope, whatever its intrinsic height (Plinko 8 vs 16 rows,
 * Blackjack's table, Treasure's grid + multiplier rail).
 */
export function ArcadeStage({
  children,
  className,
  minScale = 0.3,
  maxScale = 1.35,
  gap = 8,
}: {
  children: React.ReactNode;
  className?: string;
  minScale?: number;
  maxScale?: number;
  /** Breathing room kept above the control dock. */
  gap?: number;
}) {
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [avail, setAvail] = React.useState(0);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    let raf = 0;

    const measure = () => {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;

      const dock = document.querySelector("[data-arcade-console]") as HTMLElement | null;
      const dockH = dock?.offsetHeight ?? 0;
      const top = outer.getBoundingClientRect().top;
      const space = Math.max(160, Math.round(window.innerHeight - top - dockH - gap));

      const naturalH = inner.offsetHeight || 1;
      const next = Math.min(maxScale, Math.max(minScale, space / naturalH));

      setAvail((prev) => (Math.abs(prev - space) > 1 ? space : prev));
      setScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
    };

    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    if (innerRef.current) ro.observe(innerRef.current);
    if (outerRef.current) ro.observe(outerRef.current);
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    const poll = window.setInterval(schedule, 500);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      ro.disconnect();
    };
  }, [gap, minScale, maxScale]);

  return (
    <div
      ref={outerRef}
      className={cn("relative w-full overflow-hidden", className)}
      style={{ height: avail || undefined }}
    >
      <div
        ref={innerRef}
        className="absolute left-0 top-0 flex flex-col justify-start"
        style={{
          width: `${100 / scale}%`,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
