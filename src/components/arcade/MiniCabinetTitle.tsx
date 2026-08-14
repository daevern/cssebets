import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Engraved cabinet wordmark for the mini-arcade tables (Hi-Lo, Dice, Wheel).
 * Presentation only — mirrors the stencil language used by the larger games.
 */
export function MiniCabinetTitle({
  game,
  title,
  kicker,
}: {
  game: ArcadeGameKey;
  title: string;
  kicker: string;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-0.5 px-3 pt-2">
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
