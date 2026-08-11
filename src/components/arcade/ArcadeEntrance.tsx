import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import { cn } from "@/lib/utils";

/**
 * Short, theme-matched entrance played once when a game route first mounts.
 * Purely decorative: it wraps the board, never blocks input, and is skipped
 * entirely under prefers-reduced-motion.
 */

const DURATIONS: Record<ArcadeGameKey, number> = {
  plinko: 700,
  roulette: 700,
  treasure: 650,
  blackjack: 600,
  rps: 550,
};

const CLASS: Record<ArcadeGameKey, string> = {
  plinko: "arcade-enter-plinko",
  roulette: "arcade-enter-roulette",
  treasure: "arcade-enter-treasure",
  blackjack: "arcade-enter-blackjack",
  rps: "arcade-enter-rps",
};

const KEYFRAMES = `
@keyframes arcadeEnterPlinko {
  0% { opacity: 0; transform: translateY(-10px); filter: brightness(.45) saturate(.6); }
  45% { opacity: 1; filter: brightness(1.25) saturate(1.15); }
  100% { opacity: 1; transform: translateY(0); filter: none; }
}
@keyframes arcadeEnterRoulette {
  0% { opacity: 0; transform: rotate(-26deg) scale(.9); }
  60% { opacity: 1; transform: rotate(4deg) scale(1.01); }
  100% { opacity: 1; transform: rotate(0deg) scale(1); }
}
@keyframes arcadeEnterTreasure {
  0% { opacity: 0; transform: translateY(18px) scale(.94); }
  60% { opacity: 1; transform: translateY(-3px) scale(1.01); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes arcadeEnterBlackjack {
  0% { opacity: 0; transform: perspective(900px) rotateX(9deg) scale(.97); }
  55% { opacity: 1; transform: perspective(900px) rotateX(-2deg) scale(1.005); }
  100% { opacity: 1; transform: none; }
}
@keyframes arcadeEnterRps {
  0% { opacity: 0; transform: translateY(26px); }
  70% { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
.arcade-enter-plinko { animation: arcadeEnterPlinko 700ms cubic-bezier(.2,.7,.3,1) both; }
.arcade-enter-roulette { animation: arcadeEnterRoulette 700ms cubic-bezier(.16,.8,.28,1) both; }
.arcade-enter-treasure { animation: arcadeEnterTreasure 650ms cubic-bezier(.2,.8,.3,1) both; }
.arcade-enter-blackjack { animation: arcadeEnterBlackjack 600ms cubic-bezier(.2,.75,.3,1) both; }
.arcade-enter-rps { animation: arcadeEnterRps 550ms cubic-bezier(.2,.85,.3,1) both; }
@media (prefers-reduced-motion: reduce) {
  .arcade-enter-plinko, .arcade-enter-roulette, .arcade-enter-treasure,
  .arcade-enter-blackjack, .arcade-enter-rps { animation: none !important; }
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
    const t = window.setTimeout(() => setPlaying(false), DURATIONS[game] + 60);
    return () => window.clearTimeout(t);
    // Run once per mount only — never on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={cn(playing && CLASS[game], className)}>
      {playing && <style>{KEYFRAMES}</style>}
      {children}
    </div>
  );
}
