import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import { cn } from "@/lib/utils";

/**
 * Short flat fade-in when a game route mounts.
 * No perspective / filter / spin — clean 2D only.
 */

const DURATIONS: Record<ArcadeGameKey, number> = {
  plinko: 280,
  roulette: 280,
  treasure: 280,
  blackjack: 280,
  rps: 280,
  hilo: 280,
  dice: 280,
  wheel: 280,
  keno: 280,
  crash: 280,
};

const KEYFRAMES = `
@keyframes arcadeEnterFlat {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
.arcade-enter-flat { animation: arcadeEnterFlat 280ms ease-out both; }
@media (prefers-reduced-motion: reduce) {
  .arcade-enter-flat { animation: none !important; }
}
`;

export function ArcadeEntrance({
  game,
  children,
  className,
}: {
  game: ArcadeGameKey;
  children: ReactNode;
  className?: string;
}) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [playing, setPlaying] = useState(!reduced);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || reduced) {
      setPlaying(false);
      return;
    }
    done.current = true;
    const t = window.setTimeout(() => setPlaying(false), DURATIONS[game] + 40);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn(playing && "arcade-enter-flat", className)}>
      {playing && <style>{KEYFRAMES}</style>}
      {children}
    </div>
  );
}
