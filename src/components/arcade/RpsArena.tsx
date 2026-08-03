import { memo } from "react";
import { cn } from "@/lib/utils";
import type { RpsMove } from "@/lib/arcade/rps-math";

export type ArenaPhase = "IDLE" | "LOCKED" | "REVEALING" | "SETTLED";

/** Flat 2D glyphs — no gradients, no shadows, matching the arcade aesthetic. */
function HandGlyph({ move, className }: { move: RpsMove | null; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  if (move === "ROCK") {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <rect x="12" y="20" width="40" height="28" rx="10" {...common} />
        <path d="M20 30h24M20 38h24" {...common} strokeWidth={3} />
      </svg>
    );
  }
  if (move === "PAPER") {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <rect x="14" y="12" width="36" height="40" rx="4" {...common} />
        <path d="M22 24h20M22 32h20M22 40h12" {...common} strokeWidth={3} />
      </svg>
    );
  }
  if (move === "SCISSORS") {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <path d="M20 12l18 30M44 12L26 42" {...common} />
        <circle cx="22" cy="50" r="6" {...common} />
        <circle cx="42" cy="50" r="6" {...common} />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="18" {...common} strokeDasharray="6 6" />
      <path d="M32 24v10M32 40h.01" {...common} strokeWidth={4} />
    </svg>
  );
}

function Side({
  title,
  move,
  hidden,
  shaking,
  tone,
}: {
  title: string;
  move: RpsMove | null;
  hidden: boolean;
  shaking: boolean;
  tone: "player" | "house";
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <div className="text-[9px] font-bold uppercase tracking-[0.26em] text-[var(--color-ink-muted)]">
        {title}
      </div>
      <div
        className={cn(
          "grid aspect-square w-full max-w-[132px] place-items-center rounded-[6px] bg-[var(--color-surface-2)]",
          shaking && "animate-[rps-shake_0.36s_ease-in-out_infinite]",
        )}
      >
        <HandGlyph
          move={hidden ? null : move}
          className={cn(
            "h-[56%] w-[56%]",
            hidden
              ? "text-[var(--color-ink-muted)]"
              : tone === "player"
                ? "text-[var(--color-neon)]"
                : "text-[var(--color-ink)]",
          )}
        />
      </div>
      <div className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink)]">
        {hidden ? "—" : (move ?? "—")}
      </div>
    </div>
  );
}

/**
 * Simultaneous-reveal arena.
 *
 * Both hands stay concealed while the round is in flight and flip in the SAME
 * render once the server has settled, so the animation can never leak the
 * outcome early — the client simply has no result to show until then.
 */
function RpsArenaImpl({
  phase,
  playerMove,
  serverMove,
  outcome,
}: {
  phase: ArenaPhase;
  playerMove: RpsMove | null;
  serverMove: RpsMove | null;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
}) {
  const concealed = phase !== "SETTLED";
  const shaking = phase === "LOCKED" || phase === "REVEALING";

  return (
    <div className="rounded-[6px] bg-[var(--color-surface)] p-3">
      <style>{`@keyframes rps-shake{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}`}</style>

      <div className="flex items-center gap-3">
        <Side title="You" move={playerMove} hidden={concealed} shaking={shaking} tone="player" />

        <div className="shrink-0 text-center">
          <div className="font-display text-[10px] font-black uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            {phase === "IDLE"
              ? "Ready"
              : phase === "SETTLED"
                ? outcome === "WIN"
                  ? "Win"
                  : outcome === "LOSS"
                    ? "Loss"
                    : "Draw"
                : "Revealing"}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[var(--color-ink-muted)]">VS</div>
        </div>

        <Side title="Computer" move={serverMove} hidden={concealed} shaking={shaking} tone="house" />
      </div>
    </div>
  );
}

export const RpsArena = memo(RpsArenaImpl);
