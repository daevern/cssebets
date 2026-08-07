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
  maxScale = Number.POSITIVE_INFINITY,
  gap = 0,
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
  const contentRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef({ width: 0, height: 0 });
  const [avail, setAvail] = React.useState(0);
  const [scale, setScale] = React.useState(1);

  React.useEffect(() => {
    let raf = 0;

    const readLayoutViewport = () => ({
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    });

    // Mobile browsers repeatedly change window.innerHeight while their address
    // bar moves or pull-to-refresh stretches the visual viewport. Keep the
    // layout viewport fixed unless the screen width genuinely changes.
    viewportRef.current = readLayoutViewport();

    const measure = () => {
      const outer = outerRef.current;
      const content = contentRef.current;
      if (!outer || !content) return;

      const dock = document.querySelector("[data-arcade-console]") as HTMLElement | null;
      const dockH = dock?.offsetHeight ?? 0;
      // Document-relative top so scrolling never changes the measured space
      // (viewport-relative top shrinks as you scroll, which zoomed the game).
      const top = outer.getBoundingClientRect().top + Math.max(0, window.scrollY);
      const space = Math.max(1, Math.round(viewportRef.current.height - top - dockH - gap));

      // Measure the content itself (never the stretched wrapper) so the game
      // can scale UP into leftover room, not only down.
      const naturalH = content.offsetHeight || 1;
      const next = Math.min(maxScale, Math.max(minScale, space / naturalH));

      setAvail((prev) => (Math.abs(prev - space) > 1 ? space : prev));
      setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
    };

    const schedule = () => {
      window.cancelAnimationFrame(raf);
      raf = window.requestAnimationFrame(measure);
    };

    const handleResize = () => {
      const nextViewport = readLayoutViewport();
      const isMobileViewport = window.matchMedia("(pointer: coarse)").matches;
      const widthChanged = Math.abs(nextViewport.width - viewportRef.current.width) > 40;
      if (!isMobileViewport || widthChanged) viewportRef.current = nextViewport;
      schedule();
    };

    const handleOrientationChange = () => {
      window.setTimeout(() => {
        viewportRef.current = readLayoutViewport();
        schedule();
      }, 150);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    if (innerRef.current) ro.observe(innerRef.current);
    if (outerRef.current) ro.observe(outerRef.current);
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleOrientationChange);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleOrientationChange);
      ro.disconnect();
    };
  }, [gap, minScale, maxScale]);

  return (
    <div
      ref={outerRef}
      className={cn(
        "relative left-1/2 w-screen -translate-x-1/2 overflow-hidden",
        className,
      )}
      style={{ height: avail || undefined }}
    >
      <div
        ref={innerRef}
        className="absolute inset-x-0 top-0 flex min-h-full flex-col justify-start"
        style={{
          width: `${100 / scale}%`,
          minHeight: avail ? `${avail / scale}px` : undefined,
          transform: `scale(${scale})`,
          transformOrigin: "top left",
        }}
      >
        {children}
      </div>
    </div>
  );
}
