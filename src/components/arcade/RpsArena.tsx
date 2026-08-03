import { memo } from "react";
import { cn } from "@/lib/utils";
import { RPS_MOVES, type RpsMove } from "@/lib/arcade/rps-math";

export type ArenaPhase = "IDLE" | "LOCKED" | "REVEALING" | "SETTLED";

/** Flat 2D glyphs — no gradients, no shadows, matching the arcade aesthetic. */
function HandGlyph({ move, className }: { move: RpsMove | null; className?: string }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 4,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
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

/** Concealed tile — flat card back carrying the cssebets wordmark. */
function CardBack({ dim }: { dim?: boolean }) {
  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center rounded-[6px] bg-[var(--color-neon)]",
        dim && "opacity-35",
      )}
    >
      <span className="-rotate-[38deg] font-display text-[9px] font-black uppercase tracking-[0.12em] text-black">
        csse
      </span>
    </div>
  );
}

type Tone = "WIN" | "LOSS" | "DRAW" | null;

const toneText = (t: Tone) =>
  t === "WIN"
    ? "text-[var(--color-neon)]"
    : t === "LOSS"
      ? "text-red-400"
      : t === "DRAW"
        ? "text-amber-300"
        : "text-[var(--color-ink)]";

const toneRing = (t: Tone) =>
  t === "WIN"
    ? "ring-2 ring-[var(--color-neon)]"
    : t === "LOSS"
      ? "ring-2 ring-red-500"
      : t === "DRAW"
        ? "ring-2 ring-amber-400"
        : "";

/**
 * A single ladder card that physically flips on its Y axis when it reveals.
 * Face-down = card back; face-up = the hand that was played.
 */
function FlipCard({
  faceUp,
  move,
  tone,
  active,
  shaking,
}: {
  faceUp: boolean;
  move: RpsMove | null;
  tone: Tone;
  active: boolean;
  shaking: boolean;
}) {
  return (
    <div
      className={cn(
        "aspect-[3/4] w-full rounded-[6px] [perspective:700px]",
        active && shaking && "animate-[rps-shake_0.36s_ease-in-out_infinite]",
      )}
    >
      <div
        className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* Back */}
        <div
          className={cn(
            "absolute inset-0 overflow-hidden rounded-[6px] [backface-visibility:hidden]",
            active && "ring-2 ring-[var(--color-neon)]",
          )}
        >
          <CardBack dim={!active} />
        </div>
        {/* Face */}
        <div
          className={cn(
            "absolute inset-0 grid place-items-center overflow-hidden rounded-[6px] bg-[var(--color-surface-2)] [backface-visibility:hidden] [transform:rotateY(180deg)]",
            toneRing(tone),
          )}
        >
          <HandGlyph move={move} className={cn("h-[62%] w-[62%]", toneText(tone))} />
        </div>
      </div>
    </div>
  );
}

const LADDER_LENGTH = 7;

/**
 * Stake-style RPS board.
 *
 * Row 1 — the computer's committed hands on the current win streak.
 * Row 2 — the player's matching output for each step.
 * Row 3 — the dispenser: pick rock, paper or scissors.
 *
 * Both hands stay concealed while the round is in flight and flip in the SAME
 * render once the server has settled, so the animation can never leak the
 * outcome early.
 */
function RpsArenaImpl({
  phase,
  playerMove,
  serverMove,
  outcome,
  winMultiplier,
  history,
  onChoose,
  canPlay,
}: {
  phase: ArenaPhase;
  playerMove: RpsMove | null;
  serverMove: RpsMove | null;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
  winMultiplier: number;
  /** Most recent first. */
  history: Array<{ id: string; player: RpsMove | null; server: RpsMove | null; outcome: string }>;
  onChoose: (move: RpsMove) => void;
  canPlay: boolean;
}) {
  const concealed = phase !== "SETTLED";
  const shaking = phase === "LOCKED" || phase === "REVEALING";

  const past = history.slice(-(LADDER_LENGTH - 1));
  const activeIndex = past.length;

  return (
    <div className="rounded-[6px] bg-[var(--color-surface)] p-3">
      <style>{`
@keyframes rps-shake{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-8px) rotate(-4deg)}75%{transform:translateY(-8px) rotate(4deg)}}
@keyframes rps-pop{0%{transform:scale(1)}45%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes rps-drop{0%{transform:translateY(-10px);opacity:0}100%{transform:translateY(0);opacity:1}}
`}</style>

      {/* Server / algorithm ladder */}
      <div className="mb-1 font-display text-[8px] font-black uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        Server
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: LADDER_LENGTH }).map((_, i) => {
          const done = past[i];
          const isActive = i === activeIndex;
          const revealedHere = isActive && !concealed;
          const tone: Tone = done
            ? (done.outcome as Tone)
            : revealedHere
              ? (outcome as Tone)
              : null;
          const badgeTone = done
            ? done.outcome
            : revealedHere
              ? outcome
              : null;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <FlipCard
                faceUp={Boolean(done) || revealedHere}
                move={done ? done.server : serverMove}
                tone={tone}
                active={isActive}
                shaking={shaking}
              />
              <div
                className={cn(
                  "rounded-[3px] px-1 font-mono text-[8px] font-bold tabular-nums transition-colors",
                  badgeTone === "WIN"
                    ? "bg-[var(--color-neon)] text-black animate-[rps-pop_0.35s_ease-out]"
                    : badgeTone === "LOSS"
                      ? "bg-red-500 text-white animate-[rps-pop_0.35s_ease-out]"
                      : badgeTone === "DRAW"
                        ? "bg-amber-400 text-black animate-[rps-pop_0.35s_ease-out]"
                        : isActive
                          ? "bg-[var(--color-ink)] text-black"
                          : "text-[var(--color-ink-muted)] opacity-60",
                )}
              >
                {(winMultiplier ** (i + 1)).toFixed(2)}×
              </div>
            </div>
          );
        })}
      </div>

      {/* Player output */}
      <div className="mb-1 mt-2 font-display text-[8px] font-black uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        You
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {Array.from({ length: LADDER_LENGTH }).map((_, i) => {
          const done = past[i];
          const isActive = i === activeIndex;
          const revealedHere = isActive && !concealed;
          const show = done ? done.player : revealedHere ? playerMove : null;
          const tone: Tone = done
            ? (done.outcome as Tone)
            : revealedHere
              ? (outcome as Tone)
              : null;
          return (
            <div
              key={i}
              className={cn(
                "grid aspect-square w-full place-items-center rounded-[6px] bg-[var(--color-surface-2)] transition-all duration-300",
                tone ? toneRing(tone) : isActive ? "ring-2 ring-[var(--color-neon)]/60" : "",
                isActive && shaking && "animate-[rps-shake_0.36s_ease-in-out_infinite]",
              )}
            >
              {show ? (
                <HandGlyph
                  move={show}
                  className={cn(
                    "h-[60%] w-[60%] animate-[rps-drop_0.3s_ease-out]",
                    toneText(tone),
                  )}
                />
              ) : (
                <span className="font-mono text-[9px] text-[var(--color-ink-muted)]">—</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Status line */}
      <div
        className={cn(
          "mt-3 text-center font-display text-[10px] font-black uppercase tracking-[0.28em] transition-colors",
          phase === "SETTLED" ? toneText(outcome as Tone) : "text-[var(--color-ink-muted)]",
        )}
      >
        {phase === "IDLE"
          ? "Pick your hand"
          : phase === "SETTLED"
            ? outcome === "WIN"
              ? "You win"
              : outcome === "LOSS"
                ? "Computer wins"
                : "Draw"
            : "Revealing"}
      </div>

      {/* Dispenser */}
      <div className="mt-2 flex flex-col items-center">
        <div className="h-3 w-12 rounded-t-[4px] bg-[var(--color-surface-2)]" />
        <div className="h-2 w-28 rounded-[3px] bg-[var(--color-surface-2)]" />
        <div className="flex w-full items-start justify-center">
          <div className="mt-0 h-4 w-px bg-[var(--color-surface-border)]" />
        </div>

        <div className="grid w-full grid-cols-3 gap-2">
          {RPS_MOVES.map((m) => {
            const selected = playerMove === m;
            return (
              <button
                key={m}
                type="button"
                disabled={!canPlay}
                onClick={() => onChoose(m)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-[6px] bg-[var(--color-surface-2)] px-2 pb-2 pt-3 transition-all duration-150 active:translate-y-[2px] active:scale-[0.97] disabled:opacity-40",
                  selected
                    ? "-translate-y-[2px] ring-2 ring-[var(--color-neon)]"
                    : "ring-1 ring-[var(--color-surface-border)] hover:ring-[var(--color-neon)]/50",
                )}
              >
                <HandGlyph
                  move={m}
                  className={cn(
                    "h-9 w-9 transition-transform duration-150",
                    selected
                      ? "scale-110 text-[var(--color-neon)] animate-[rps-pop_0.3s_ease-out]"
                      : "text-[var(--color-ink)]",
                  )}
                />
                <span className="font-display text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                  {m}
                </span>
                <span
                  className={cn(
                    "h-1 w-8 rounded-[2px] transition-colors",
                    selected ? "bg-[var(--color-neon)]" : "bg-[var(--color-surface-border)]",
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const RpsArena = memo(RpsArenaImpl);
