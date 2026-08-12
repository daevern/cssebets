import * as React from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * In-table settle beat: a short brass plaque that lands ON the board (pocket,
 * multiplier, total, winner) just before the themed result dialog opens.
 * Presentation only — it never gates or changes a settlement.
 */
export function SettlePlaque({
  game,
  label,
  value,
  show,
  className,
}: {
  game: ArcadeGameKey;
  label: string;
  value: React.ReactNode;
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  const t = ARCADE_THEMES[game];
  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 z-30 -translate-x-1/2 -translate-y-1/2",
        "rounded-[6px] border px-4 py-2 text-center",
        "motion-safe:[animation:arcadeSettlePlaque_360ms_ease-out]",
        className,
      )}
      style={{
        background: t.hud.plaqueBg,
        borderColor: t.accent,
      }}
    >
      <div
        className="text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
        style={{ letterSpacing: t.hud.labelTracking }}
      >
        {label}
      </div>
      <div
        className="font-display text-xl font-black tabular-nums leading-tight"
        style={{ color: t.accent }}
      >
        {value}
      </div>
    </div>
  );
}

/** Drives a 250–400ms plaque beat, then hands off to the result dialog. */
export function useSettleBeat(durationMs = 320) {
  const [beat, setBeat] = React.useState(false);
  const timer = React.useRef<number | null>(null);

  const run = React.useCallback(
    (then: () => void) => {
      setBeat(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setBeat(false);
        then();
      }, durationMs);
    },
    [durationMs],
  );

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  return { beat, run };
}
