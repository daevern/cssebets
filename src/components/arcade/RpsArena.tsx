import { memo } from "react";
import { cn } from "@/lib/utils";
import { RPS_MOVES, type RpsMove } from "@/lib/arcade/rps-math";

export type ArenaPhase = "IDLE" | "LOCKED" | "REVEALING" | "SETTLED";

/**
 * Custom line-art hands — no emoji, no gradients. Flat 2D strokes that match
 * the arcade aesthetic and read clearly at small sizes.
 */
function HandGlyph({ move, className }: { move: RpsMove | null; className?: string }) {
  const s = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 3.2,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };

  if (move === "ROCK") {
    // Closed fist, knuckles up, thumb folded across.
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <path d="M15 34c0-8 4-13 10-14.5 4.5-1.2 9-1.2 14 .2 6 1.7 10 6 10 14.3v5c0 7-6 12-17 12s-17-5-17-12v-5Z" {...s} />
        <path d="M20 30.5c3-2.2 6-3.2 9-3.2s6.5 1 9.6 3.2" {...s} strokeWidth={2.6} />
        <path d="M47 32.5c2.9.4 5 2.4 5 5.2 0 2.8-2 4.8-5 5.4" {...s} strokeWidth={2.6} />
        <path d="M24 41h16" {...s} strokeWidth={2.6} />
      </svg>
    );
  }

  if (move === "PAPER") {
    // Open hand, four fingers plus thumb.
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <path d="M25 33V15.5a3.5 3.5 0 1 1 7 0V31" {...s} />
        <path d="M32 30V13a3.5 3.5 0 1 1 7 0v18" {...s} />
        <path d="M39 31V17.5a3.5 3.5 0 1 1 7 0V36" {...s} />
        <path d="M25 33V25a3.5 3.5 0 0 0-7 0v14c0 8.5 5.6 15 15 15h4c6.6 0 11-4.4 11-11v-7" {...s} />
      </svg>
    );
  }

  if (move === "SCISSORS") {
    // Two extended fingers in a V, folded fist beneath.
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <path d="M24 34 16.5 14.8a3.5 3.5 0 0 1 6.5-2.6L32 31" {...s} />
        <path d="m34 31 9-18.8a3.5 3.5 0 0 1 6.3 3L41 34" {...s} />
        <path d="M41 33c4 1 6.5 4.6 6.5 9.2C47.5 49 42 54 34 54h-3c-8 0-13.5-5.4-13.5-13v-9" {...s} />
        <path d="M24 40h8" {...s} strokeWidth={2.6} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <circle cx="32" cy="32" r="17" {...s} strokeDasharray="6 6" />
      <path d="M32 24v10M32 40h.01" {...s} strokeWidth={3.5} />
    </svg>
  );
}

/** Concealed tile — flat card back carrying the cssebets wordmark. */
function CardBack({ dim }: { dim?: boolean }) {
  return (
    <div
      className={cn(
        "grid h-full w-full place-items-center rounded-[6px] bg-[var(--color-neon)]",
        dim && "opacity-30",
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

/** A card that physically flips on its Y axis when it reveals. */
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
        <div
          className={cn(
            "absolute inset-0 overflow-hidden rounded-[6px] [backface-visibility:hidden]",
            active && "ring-2 ring-[var(--color-neon)]",
          )}
        >
          <CardBack dim={!active} />
        </div>
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

/** One column of the rail: server card on top, player hand below, multiplier badge. */
function RailCell({
  scale,
  faceUp,
  serverMove,
  playerMove,
  tone,
  active,
  shaking,
  multiplier,
  placeholder,
}: {
  scale: "past" | "active" | "next";
  faceUp: boolean;
  serverMove: RpsMove | null;
  playerMove: RpsMove | null;
  tone: Tone;
  active: boolean;
  shaking: boolean;
  multiplier: number;
  placeholder?: boolean;
}) {
  const width =
    scale === "active" ? "w-[92px]" : scale === "next" ? "w-[62px]" : "w-[62px]";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-1.5 transition-all duration-500",
        width,
        scale === "past" && "opacity-70",
        scale === "next" && "opacity-40",
      )}
    >
      <FlipCard
        faceUp={faceUp}
        move={serverMove}
        tone={tone}
        active={active}
        shaking={shaking}
      />

      <div
        className={cn(
          "grid aspect-square w-full place-items-center rounded-[6px] bg-[var(--color-surface-2)] transition-all duration-300",
          tone ? toneRing(tone) : active ? "ring-2 ring-[var(--color-neon)]/60" : "",
          active && shaking && "animate-[rps-shake_0.36s_ease-in-out_infinite]",
        )}
      >
        {playerMove ? (
          <HandGlyph
            move={playerMove}
            className={cn("h-[62%] w-[62%] animate-[rps-drop_0.3s_ease-out]", toneText(tone))}
          />
        ) : (
          <span className="font-mono text-[10px] text-[var(--color-ink-muted)]">—</span>
        )}
      </div>

      <div
        className={cn(
          "rounded-[3px] px-1.5 font-mono text-[9px] font-bold tabular-nums transition-colors",
          tone === "WIN"
            ? "bg-[var(--color-neon)] text-black animate-[rps-pop_0.35s_ease-out]"
            : tone === "LOSS"
              ? "bg-red-500 text-white animate-[rps-pop_0.35s_ease-out]"
              : tone === "DRAW"
                ? "bg-amber-400 text-black animate-[rps-pop_0.35s_ease-out]"
                : active && !placeholder
                  ? "bg-[var(--color-ink)] text-black"
                  : "text-[var(--color-ink-muted)] opacity-60",
        )}
      >
        {multiplier.toFixed(2)}×
      </div>
    </div>
  );
}

/**
 * Centre-anchored RPS rail.
 *
 * The live card always sits in the MIDDLE. Settled results slide out to the
 * left (most recent nearest the centre) and the next, still-sleeping card
 * waits on the right. Server hand on top, your hand underneath.
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
  /** Oldest first. */
  history: Array<{ id: string; player: RpsMove | null; server: RpsMove | null; outcome: string }>;
  onChoose: (move: RpsMove) => void;
  canPlay: boolean;
}) {
  const concealed = phase !== "SETTLED";
  const shaking = phase === "LOCKED" || phase === "REVEALING";

  const past = history.slice(-3);
  const step = history.length;

  return (
    <div className="overflow-hidden rounded-[6px] bg-[var(--color-surface)] p-3">
      <style>{`
@keyframes rps-shake{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-8px) rotate(-4deg)}75%{transform:translateY(-8px) rotate(4deg)}}
@keyframes rps-pop{0%{transform:scale(1)}45%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes rps-drop{0%{transform:translateY(-10px);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes rps-slide-in{0%{transform:translateX(46px) scale(.9);opacity:0}100%{transform:translateX(0) scale(1);opacity:1}}
`}</style>

      <div className="mb-1 flex items-center justify-between">
        <span className="font-display text-[8px] font-black uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          Server
        </span>
        <span className="font-display text-[8px] font-black uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          You
        </span>
      </div>

      {/* Rail — the active column is centred; history drifts left, next waits right. */}
      <div className="relative flex items-start justify-center gap-2 py-1">
        {/* Left: settled results, most recent closest to the centre. */}
        <div className="flex flex-1 items-start justify-end gap-2 overflow-hidden">
          {past.map((h, i) => (
            <RailCell
              key={h.id}
              scale="past"
              faceUp
              serverMove={h.server}
              playerMove={h.player}
              tone={h.outcome as Tone}
              active={false}
              shaking={false}
              multiplier={winMultiplier ** (step - past.length + i + 1)}
            />
          ))}
        </div>

        {/* Centre: the live card. */}
        <div key={step} className="animate-[rps-slide-in_0.45s_ease-out]">
          <RailCell
            scale="active"
            faceUp={!concealed}
            serverMove={serverMove}
            playerMove={concealed ? null : playerMove}
            tone={concealed ? null : (outcome as Tone)}
            active
            shaking={shaking}
            multiplier={winMultiplier ** (step + 1)}
          />
        </div>

        {/* Right: the next card, still asleep. */}
        <div className="flex flex-1 items-start justify-start gap-2 overflow-hidden">
          <RailCell
            scale="next"
            faceUp={false}
            serverMove={null}
            playerMove={null}
            tone={null}
            active={false}
            shaking={false}
            multiplier={winMultiplier ** (step + 2)}
            placeholder
          />
        </div>
      </div>

      {/* Status line */}
      <div
        className={cn(
          "mt-2 text-center font-display text-[10px] font-black uppercase tracking-[0.28em] transition-colors",
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
        <div className="h-4 w-px bg-[var(--color-surface-border)]" />

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
