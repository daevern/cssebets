import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

/**
 * Quiet idle tip over the table — one line, cabinet language.
 * Presentation only; hide whenever a round is live.
 */
export function ArcadeIdleCue({
  game,
  show,
  children,
  className,
}: {
  game: ArcadeGameKey;
  show: boolean;
  children: ReactNode;
  className?: string;
}) {
  const t = ARCADE_THEMES[game];
  if (!show) return null;
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3",
        className,
      )}
    >
      <span
        className="rounded-full border px-3 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]"
        style={{
          background: t.hud.plaqueBg,
          borderColor: t.hud.plaqueBorder,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.07)",
          animation: "arcadePedestalBreathe 2.8s ease-in-out infinite",
        }}
      >
        {children}
      </span>
    </div>
  );
}
