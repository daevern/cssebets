import type { ReactNode } from "react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Engraved cabinet wordmark for the mini-arcade tables (Hi-Lo, Dice, Wheel).
 * Optional mark breaks the shared stencil so each table reads differently.
 */
export function MiniCabinetTitle({
  game,
  title,
  kicker,
  mark,
}: {
  game: ArcadeGameKey;
  title: string;
  kicker: string;
  mark?: ReactNode;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-1 px-3 pt-2">
      {mark ? (
        <div className="mb-0.5 flex h-7 w-7 items-center justify-center" style={{ color: t.accent }}>
          {mark}
        </div>
      ) : null}
      <span
        className="font-display text-[22px] font-black uppercase leading-none tracking-[0.16em]"
        style={{ color: t.accent, textShadow: "0 1px 0 rgba(0,0,0,.55)" }}
      >
        {title}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {kicker}
      </span>
    </div>
  );
}
