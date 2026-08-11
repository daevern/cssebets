import * as React from "react";
import { cn } from "@/lib/utils";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Ambient colour spill for a game's playfield.
 *
 * Rendered as a SIBLING behind <ArcadeStage/> (never as its child) because the
 * stage clips its own content with overflow-hidden for scale-to-fit measuring.
 * Presentation only.
 */
const SPILL: Record<ArcadeGameKey, string> = {
  plinko:
    "radial-gradient(70% 78% at 50% 36%, rgba(46,56,214,.95) 0%, rgba(28,35,158,.88) 34%, rgba(15,20,102,.68) 58%, rgba(8,12,64,.34) 78%, transparent 92%)",
  treasure:
    "radial-gradient(70% 78% at 50% 34%, rgba(74,21,134,.98) 0%, rgba(52,13,92,.9) 34%, rgba(30,8,56,.7) 58%, rgba(18,5,34,.35) 78%, transparent 92%)",
  roulette:
    "radial-gradient(70% 78% at 50% 36%, rgba(10,107,61,.95) 0%, rgba(8,86,50,.86) 32%, rgba(224,182,74,.22) 56%, rgba(6,44,26,.4) 76%, transparent 92%)",
  blackjack:
    "radial-gradient(70% 78% at 50% 36%, rgba(22,77,57,.95) 0%, rgba(16,60,44,.86) 32%, rgba(224,182,74,.20) 56%, rgba(6,34,25,.4) 76%, transparent 92%)",
  rps: "radial-gradient(70% 78% at 50% 36%, rgba(35,110,130,.9) 0%, rgba(24,80,96,.8) 34%, rgba(92,225,242,.18) 58%, rgba(16,32,40,.4) 78%, transparent 92%)",
};

export function ArcadeGlow({
  game,
  className,
}: {
  game: ArcadeGameKey;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute -inset-x-[45vw] -top-12 -bottom-6 -z-10",
        className,
      )}
      style={{ background: SPILL[game], filter: "blur(34px)" }}
    />
  );
}
