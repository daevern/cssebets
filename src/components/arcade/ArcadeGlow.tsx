import * as React from "react";
import { cn } from "@/lib/utils";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Ambient colour spill for a game's playfield.
 *
 * Rendered as a SIBLING behind <ArcadeStage/> (never as its child) because the
 * stage clips its own content with overflow-hidden for scale-to-fit measuring.
 * Each game spills its own established accent (see ARCADE_THEMES) so the side
 * gutters read as room light instead of empty page. Presentation only.
 */
const SPILL: Record<ArcadeGameKey, string> = {
  plinko:
    "radial-gradient(85% 92% at 50% 40%, rgba(76,90,224,.70) 0%, rgba(60,72,206,.46) 34%, rgba(46,56,214,.24) 58%, rgba(23,30,120,.10) 80%, transparent 96%)",
  treasure:
    "radial-gradient(85% 92% at 50% 40%, rgba(154,62,232,.62) 0%, rgba(120,40,196,.42) 34%, rgba(88,26,150,.22) 58%, rgba(46,12,84,.10) 80%, transparent 96%)",
  roulette:
    "radial-gradient(85% 92% at 50% 40%, rgba(16,150,88,.60) 0%, rgba(12,120,70,.40) 34%, rgba(224,182,74,.16) 58%, rgba(8,64,38,.10) 80%, transparent 96%)",
  blackjack:
    "radial-gradient(85% 92% at 50% 40%, rgba(24,120,86,.58) 0%, rgba(20,96,70,.38) 34%, rgba(224,182,74,.15) 58%, rgba(8,44,32,.10) 80%, transparent 96%)",
  rps: "radial-gradient(85% 92% at 50% 40%, rgba(56,180,205,.55) 0%, rgba(46,150,175,.36) 34%, rgba(92,225,242,.18) 58%, rgba(20,60,74,.09) 80%, transparent 96%)",
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
        "pointer-events-none absolute -inset-x-[45vw] -top-12 -bottom-6 z-0",
        className,
      )}
      style={{ background: SPILL[game], filter: "blur(56px)" }}
    />
  );
}

/**
 * Cabinet lighting pass painted INSIDE the stage: a soft overhead key light,
 * a warm bounce off the rail and a vignette that pushes the corners down so
 * the playfield reads as a lit object in a room rather than a flat panel.
 * Sits above the stage void and below the playfield content.
 */
const KEY_LIGHT: Record<ArcadeGameKey, string> = {
  plinko: "rgba(160,172,255,.16)",
  treasure: "rgba(198,146,255,.16)",
  roulette: "rgba(255,226,150,.15)",
  blackjack: "rgba(255,226,150,.14)",
  rps: "rgba(150,232,247,.16)",
};

export function CabinetLight({ game, className }: { game: ArcadeGameKey; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 z-[1]", className)}>
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 70% at 50% -10%, ${KEY_LIGHT[game]} 0%, transparent 62%)`,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 100% at 50% 55%, transparent 38%, rgba(0,0,0,.30) 78%, rgba(0,0,0,.55) 100%)",
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg,transparent,rgba(255,255,255,.22),transparent)" }}
      />
    </div>
  );
}
