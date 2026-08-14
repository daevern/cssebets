import type { ReactNode } from "react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Engraved table wordmark — title only, Blackjack-style.
 * Kickers and icons live off the stage so the playfield stays quiet.
 */
export function MiniCabinetTitle({
  game,
  title,
}: {
  game: ArcadeGameKey;
  title: string;
  /** @deprecated ignored — kept so call sites compile during cleanup */
  kicker?: string;
  mark?: ReactNode;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <div className="pointer-events-none flex w-full items-center justify-center gap-2 px-3 pb-1 pt-2">
      <span aria-hidden className="text-[10px] leading-none text-white/35">
        ◆
      </span>
      <span
        className="font-display text-[15px] font-black uppercase leading-none tracking-[0.2em]"
        style={{ color: t.accent, textShadow: "0 1px 0 rgba(0,0,0,.55)" }}
      >
        {title}
      </span>
      <span aria-hidden className="text-[10px] leading-none text-white/35">
        ◆
      </span>
    </div>
  );
}
