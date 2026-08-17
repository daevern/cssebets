import * as React from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Flat 2D HUD plaques — solid fills, hairline borders. Presentation only.
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
        data-arcade-hud
        className={cn(
          // Default clears the sportsbook TopBar. Immersive table mode flips to top-0 via styles.css.
          "sticky top-14 z-20 -mx-3 flex items-stretch gap-1.5 border-b px-3 py-1.5 md:top-16",
          className,
        )}
        style={{
          background: t.hud.plaqueBg,
          borderColor: t.hud.plaqueBorder,
        }}
      >
        {children}
      </div>
    </HudCtx.Provider>
  );
}

/** Compact RTP / fairness read-out for cabinet HUDs. */
export function FairnessPlaque({
  game,
  rtpLabel,
  tag = "Fair",
  className,
}: {
  game?: ArcadeGameKey;
  rtpLabel: string;
  tag?: string;
  className?: string;
}) {
  const ctxGame = React.useContext(HudCtx);
  const g = game ?? ctxGame;
  const t = ARCADE_THEMES[g];
  return (
    <div
      className={cn("min-w-0 shrink-0 rounded-[5px] border px-2 py-1", className)}
      style={{
        background: t.hud.plaqueBg,
        borderColor: t.hud.plaqueBorder,
      }}
      title="Published theoretical RTP — server decides every payout"
    >
      <div
        className="text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
        style={{ letterSpacing: t.hud.labelTracking }}
      >
        RTP · {tag}
      </div>
      <div
        className="font-display text-sm font-bold tabular-nums"
        style={{ color: t.accent }}
      >
        {rtpLabel}
      </div>
    </div>
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
      data-testid={label === "Balance" ? "hud-balance" : undefined}
      style={{
        background: t.hud.plaqueBg,
        borderColor: t.hud.plaqueBorder,
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

/** Flat mode: no grain / vignette overlay. */
export function SurfaceGrain(_props: {
  game: ArcadeGameKey;
  className?: string;
  radius?: string;
}) {
  return null;
}
