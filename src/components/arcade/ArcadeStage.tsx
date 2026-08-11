import * as React from "react";
import { cn } from "@/lib/utils";
import { ArcadeSoundToggle } from "@/components/arcade/ArcadeSoundToggle";
import { SurfaceGrain } from "@/components/arcade/ArcadeHud";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

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
  game,
  minScale = 0.3,
  maxScale = 1.35,
  gap = 8,
}: {
  children: React.ReactNode;
  className?: string;
  /** Paints the cabinet's stage void + grain behind the playfield. */
  game?: ArcadeGameKey;
  minScale?: number;
  maxScale?: number;
  /** Breathing room kept above the control dock. */
  gap?: number;
}) {
  const outerRef = React.useRef<HTMLDivElement | null>(null);
  const innerRef = React.useRef<HTMLDivElement | null>(null);
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
      const inner = innerRef.current;
      if (!outer || !inner) return;

      const dock = document.querySelector("[data-arcade-console]") as HTMLElement | null;
      const dockH = dock?.offsetHeight ?? 0;
      // Document-relative top so scrolling never changes the measured space
      // (viewport-relative top shrinks as you scroll, which zoomed the game).
      const top = outer.getBoundingClientRect().top + Math.max(0, window.scrollY);
      const space = Math.max(
        160,
        Math.round(viewportRef.current.height - top - dockH - gap),
      );

      const naturalH = inner.offsetHeight || 1;
      const next = Math.min(maxScale, Math.max(minScale, space / naturalH));

      setAvail((prev) => (Math.abs(prev - space) > 1 ? space : prev));
      setScale((prev) => (Math.abs(prev - next) > 0.01 ? next : prev));
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
      className={cn("relative w-full overflow-hidden", game && "rounded-[18px]", className)}
      style={{
        height: avail || undefined,
        background: game ? ARCADE_THEMES[game].stageBg : undefined,
      }}
    >
      {game && <SurfaceGrain game={game} radius="18px" />}
      <ArcadeSoundToggle className="absolute right-2 top-2 z-30" />
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
