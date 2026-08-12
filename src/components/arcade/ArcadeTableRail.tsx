import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { arcadeFairness } from "@/lib/arcade/published-rtp";
import type { ArcadeGameKey } from "@/lib/arcade/sound";
import { ArcadeSoundToggle } from "@/components/arcade/ArcadeSoundToggle";
import { cn } from "@/lib/utils";

/**
 * Slim cabinet rail shown only in immersive table mode (app chrome hidden).
 * Exit + identity + fairness + mute — presentation only.
 */
export function ArcadeTableRail({
  game,
  fairnessOpts,
  className,
}: {
  game: ArcadeGameKey;
  fairnessOpts?: Parameters<typeof arcadeFairness>[1];
  className?: string;
}) {
  const t = ARCADE_THEMES[game];
  const fair = arcadeFairness(game, fairnessOpts);

  return (
    <div
      data-arcade-table-rail
      className={cn(
        "sticky top-0 z-40 -mx-3 mb-1 flex items-center gap-2 border-b px-3 py-1.5 backdrop-blur-md md:-mx-6 md:px-6",
        className,
      )}
      style={{
        background: "rgba(0,0,0,.72)",
        borderColor: t.hud.plaqueBorder,
      }}
    >
      <Link
        to="/arcade"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
        style={{ borderColor: t.hud.plaqueBorder }}
        aria-label="Back to arcade lobby"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>

      <div className="min-w-0 flex-1">
        <div
          className="truncate font-display text-[13px] font-black uppercase tracking-[0.14em]"
          style={{ color: t.accent }}
        >
          {t.label}
        </div>
        <div className="truncate text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          Table mode
        </div>
      </div>

      <div
        className="shrink-0 rounded-[5px] border px-2 py-1 text-right"
        style={{
          background: t.hud.plaqueBg,
          borderColor: t.hud.plaqueBorder,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.07)",
        }}
        title="Published theoretical RTP — payouts are decided by the server"
      >
        <div
          className="text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
          style={{ letterSpacing: t.hud.labelTracking }}
        >
          RTP
        </div>
        <div
          className="font-display text-[12px] font-bold tabular-nums leading-none"
          style={{ color: t.accent }}
        >
          {fair.rtpLabel}
        </div>
      </div>

      <div
        className="hidden shrink-0 rounded-[5px] border px-2 py-1 text-right sm:block"
        style={{
          background: t.hud.plaqueBg,
          borderColor: t.hud.plaqueBorder,
        }}
      >
        <div
          className="text-[8px] font-bold uppercase text-[var(--color-ink-muted)]"
          style={{ letterSpacing: t.hud.labelTracking }}
        >
          Fairness
        </div>
        <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink)]">
          {fair.tag}
        </div>
      </div>

      <ArcadeSoundToggle className="shrink-0" />
    </div>
  );
}
