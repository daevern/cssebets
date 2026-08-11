import * as React from "react";
import { cn } from "@/lib/utils";
import { ARCADE_GRAIN_URL, ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Engraved HUD plaques — the cabinet's brass read-outs, not a SaaS stat card
 * stack. Presentation only.
 */

const HudCtx = React.createContext<ArcadeGameKey>("plinko");

export function HudBar({
  game,
  children,
  className,
}: {
  game: ArcadeGameKey;
  children: React.ReactNode;
  className?: string;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <HudCtx.Provider value={game}>
      <div
        className={cn(
          "sticky top-14 z-20 -mx-3 flex items-stretch gap-1.5 border-b px-3 py-1.5 backdrop-blur-md md:top-16",
          className,
        )}
        style={{
          background: "rgba(0,0,0,.5)",
          borderColor: t.hud.plaqueBorder,
        }}
      >
        {children}
      </div>
    </HudCtx.Provider>
  );
}

/** One engraved read-out. `hero` gives the balance its bigger, brighter face. */
export function HudPlaque({
  label,
  value,
  accent,
  tone,
  hero,
  className,
  game: gameProp,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
  tone?: "up" | "down";
  hero?: boolean;
  className?: string;
  /** Explicit cabinet when the plaque sits outside a HudBar. */
  game?: ArcadeGameKey;
}) {
  const ctxGame = React.useContext(HudCtx);
  const game = gameProp ?? ctxGame;
  const t = ARCADE_THEMES[game];
  return (
    <div
      className={cn("min-w-0 rounded-[5px] border px-2.5 py-1", className)}
      style={{
        background: t.hud.plaqueBg,
        borderColor: t.hud.plaqueBorder,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.07), inset 0 -2px 6px rgba(0,0,0,.45)",
      }}
    >
      <div
        className="truncate text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
        style={{ letterSpacing: t.hud.labelTracking }}
      >
        {label}
      </div>
      <div
        className={cn(
          "truncate font-display font-bold tabular-nums",
          hero ? "text-[15px]" : "text-sm",
        )}
        style={{
          color:
            tone === "up"
              ? "#7ee2a8"
              : tone === "down"
                ? "#ff8f9c"
                : accent || hero
                  ? t.accent
                  : "var(--color-ink)",
        }}
      >
        {value}
      </div>
    </div>
  );
}

/**
 * Grain + rim-light overlay for any hero surface (felt, stone, glass).
 * Absolutely positioned; the parent needs `relative`.
 */
export function SurfaceGrain({
  game,
  className,
  radius,
}: {
  game: ArcadeGameKey;
  className?: string;
  radius?: string;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <>
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", className)}
        style={{
          backgroundImage: ARCADE_GRAIN_URL,
          backgroundSize: "120px 120px",
          opacity: t.feltNoiseOpacity,
          mixBlendMode: "overlay",
          borderRadius: radius,
        }}
      />
      <div
        aria-hidden
        className={cn("pointer-events-none absolute inset-0", className)}
        style={{
          borderRadius: radius,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,.16), inset 0 -18px 40px rgba(0,0,0,.45)",
        }}
      />
    </>
  );
}
