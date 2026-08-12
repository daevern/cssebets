import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import type { ArcadeGameKey } from "@/lib/arcade/sound";

export type RecentResultItem = {
  key: string;
  label: string;
  /** Emphasise a big win / green pocket / etc. */
  tone?: "hot" | "win" | "neutral" | "loss";
};

/**
 * Unified recent-results cabinet strip — same language on every table.
 * Presentation only.
 */
export function RecentResultsStrip({
  game,
  items,
  empty = "No rounds yet",
  trailing,
  className,
}: {
  game: ArcadeGameKey;
  items: RecentResultItem[];
  empty?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  const t = ARCADE_THEMES[game];
  return (
    <div
      className={cn(
        "mt-2 flex items-center gap-1.5 overflow-x-auto rounded-[6px] border px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={{
        background: t.hud.plaqueBg,
        borderColor: t.hud.plaqueBorder,
      }}
    >
      <span
        className="shrink-0 text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
        style={{ letterSpacing: t.hud.labelTracking }}
      >
        Recent
      </span>
      {items.length === 0 ? (
        <span className="text-[9px] uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
          {empty}
        </span>
      ) : (
        items.map((it) => (
          <span
            key={it.key}
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums",
              it.tone === "hot" && "text-black",
              it.tone === "win" && "text-[var(--color-ink)]",
              it.tone === "loss" && "text-[var(--color-ink-muted)]",
              (!it.tone || it.tone === "neutral") && "text-[var(--color-ink)]",
            )}
            style={
              it.tone === "hot"
                ? { background: t.accent }
                : it.tone === "win"
                  ? { background: `${t.accent}28`, border: `1px solid ${t.accent}55` }
                  : {
                      background: "rgba(0,0,0,.3)",
                      border: `1px solid ${t.hud.plaqueBorder}`,
                    }
            }
          >
            {it.label}
          </span>
        ))
      )}
      {trailing ? <div className="ml-auto shrink-0">{trailing}</div> : null}
    </div>
  );
}
