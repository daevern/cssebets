import { memo } from "react";
import { cn } from "@/lib/utils";
import { SurfaceGrain } from "@/components/arcade/ArcadeHud";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { RPS_MOVES, rpsLadderMultiplier, type RpsMove } from "@/lib/arcade/rps-math";
import { CsseMark } from "@/components/brand/CsseMark";

export type ArenaPhase = "IDLE" | "LOCKED" | "REVEALING" | "SETTLED";

/**
 * Smooth vector hands in the Stake style: solid single-colour silhouettes with
 * rounded knuckles and fingers, no outlines, no emoji.
 */
function HandGlyph({ move, className }: { move: RpsMove | null; className?: string }) {
  if (!move) {
    return (
      <svg viewBox="0 0 64 64" className={className} aria-hidden>
        <circle cx="32" cy="46" r="4" fill="currentColor" />
        <rect x="28" y="14" width="8" height="22" rx="4" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" className={className} fill="currentColor" aria-hidden>
      {move === "ROCK" && (
        <g>
          {/* fist body */}
          <rect x="14" y="24" width="38" height="28" rx="13" />
          {/* knuckles */}
          <circle cx="22" cy="26" r="7" />
          <circle cx="32" cy="24" r="7.5" />
          <circle cx="42" cy="25" r="7" />
          <circle cx="50" cy="30" r="6" />
          {/* thumb */}
          <rect x="10" y="33" width="17" height="11" rx="5.5" />
        </g>
      )}

      {move === "PAPER" && (
        <g>
          {/* palm */}
          <rect x="18" y="30" width="30" height="24" rx="12" />
          {/* fingers */}
          <rect x="21" y="12" width="8" height="26" rx="4" />
          <rect x="30" y="8" width="8" height="30" rx="4" />
          <rect x="39" y="12" width="8" height="26" rx="4" />
          <rect x="47" y="18" width="8" height="22" rx="4" />
          {/* thumb */}
          <rect
            x="9"
            y="30"
            width="8"
            height="18"
            rx="4"
            transform="rotate(-28 13 39)"
          />
        </g>
      )}

      {move === "SCISSORS" && (
        <g>
          {/* fist body */}
          <rect x="18" y="32" width="32" height="22" rx="11" />
          <circle cx="46" cy="38" r="7" />
          {/* two extended fingers in a V */}
          <rect x="19" y="6" width="8" height="30" rx="4" transform="rotate(-18 23 21)" />
          <rect x="33" y="6" width="8" height="30" rx="4" transform="rotate(14 37 21)" />
          {/* thumb */}
          <rect x="13" y="36" width="15" height="10" rx="5" />
        </g>
      )}
    </svg>
  );
}


/** Concealed tile — the same striped CSSE card back used by Blackjack. */
function CardBack({ dim }: { dim?: boolean }) {
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-[4px] border border-white/10",
        dim && "opacity-70",
      )}
      style={{
        background: "#0f212e",
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,.05) 0 4px, transparent 4px 8px)",
      }}
    >
      <div className="absolute inset-[5px] rounded-[2px] border border-white/[.07]" />
      <div className="absolute inset-0 grid place-items-center text-white/25">
        <CsseMark variant="mono" className="h-[42%] w-[42%]" />
      </div>
    </div>
  );
}


type Tone = "WIN" | "LOSS" | "DRAW" | null;

/** Slate console stat cell — matches Dice / Hi-Lo / Wheel. */
function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent";
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-1 rounded-[6px] border px-2.5 py-2"
      style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
    >
      <span className="truncate text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span
        className="font-display text-[15px] font-black tabular-nums leading-none"
        style={{ color: tone === "accent" ? ARCADE_THEMES.rps.accent : "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}


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
        "relative aspect-[3/4] w-full overflow-hidden rounded-[6px] border border-[var(--color-surface-border)]",
        active && shaking && "animate-[rps-shake_0.36s_ease-in-out_infinite]",
        active && "ring-2 ring-[var(--color-neon)]",
      )}
    >
      {!faceUp ? (
        <CardBack dim={!active} />
      ) : (
        <div
          className={cn(
            "absolute inset-0 grid place-items-center bg-[var(--color-surface-2)]",
            toneRing(tone),
          )}
        >
          <HandGlyph move={move} className={cn("h-[62%] w-[62%]", toneText(tone))} />
        </div>
      )}
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
  const width = scale === "active" ? "w-[61px]" : "w-[42px]";
  return (
    <div
      className={cn(
        "flex shrink-0 flex-col items-center gap-1.5 transition-all duration-500",
        width,
        scale === "past" && "opacity-90",
        scale === "next" && "opacity-75",
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
          "rounded-[3px] px-2 py-[1px] font-mono text-[11px] font-bold tabular-nums transition-colors",
          tone === "WIN"
            ? "bg-[var(--color-neon)] text-black animate-[rps-badge-shake_0.5s_ease-in-out]"
            : tone === "LOSS"
              ? "bg-red-500 text-white animate-[rps-badge-shake_0.5s_ease-in-out]"
              : tone === "DRAW"
                ? "bg-amber-400 text-black animate-[rps-badge-shake_0.5s_ease-in-out]"
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
  ladder,
  tailMultiplier,
  history,
  onChoose,
  canPlay,
}: {
  phase: ArenaPhase;
  playerMove: RpsMove | null;
  serverMove: RpsMove | null;
  outcome: "WIN" | "LOSS" | "DRAW" | null;
  /** Per-step win rates: index 0 pays win #1, index 1 win #2, and so on. */
  ladder: number[];
  /** Rate paid on every step beyond the published ladder (the doubling rate). */
  tailMultiplier: number;
  /** Oldest first. */
  history: Array<{ id: string; player: RpsMove | null; server: RpsMove | null; outcome: string }>;
  onChoose: (move: RpsMove) => void;
  canPlay: boolean;
}) {
  const concealed = phase !== "SETTLED";
  const shaking = phase === "LOCKED" || phase === "REVEALING";

  // A loss ends the run. Draws hold the multiplier steady — only a win steps
  // the ladder up, exactly like Treasure Grid safe reveals.
  let runStep = 0;
  const historyWithMultipliers = history.map((round) => {
    const step = round.outcome === "WIN" ? runStep + 1 : runStep;
    const multiplier = rpsLadderMultiplier(ladder, tailMultiplier, Math.max(step, 1));
    if (round.outcome === "LOSS") runStep = 0;
    else if (round.outcome === "WIN") runStep += 1;
    return { ...round, multiplier };
  });
  const animationKey = history.length;
  const liveMultiplier = rpsLadderMultiplier(
    ladder,
    tailMultiplier,
    Math.max(runStep + (outcome === "WIN" || phase !== "SETTLED" ? 1 : 0), 1),
  );
  const nextMultipliers = Array.from({ length: 6 }, (_, i) =>
    rpsLadderMultiplier(ladder, tailMultiplier, Math.max(runStep + 1 + i, 1)),
  );


  // The rail scrolls in RTL so its natural resting position (scrollLeft 0) is
  // the newest result. No JS scroll manipulation — nothing can yank the player
  // back while they browse earlier rounds.


  return (
    // RPS owns the Stake-green identity from ARCADE_THEMES: scope the accent token
    // locally so every child inherits it.
    <div
      className="relative overflow-hidden rounded-[6px] p-2.5 md:px-6"
      style={{
        ["--color-neon" as any]: ARCADE_THEMES.rps.accent,
        background: ARCADE_THEMES.rps.feltOrBoardFill,
        boxShadow: `inset 0 0 0 1px ${ARCADE_THEMES.rps.dock.chipEdge}`,
      }}
    >
      <SurfaceGrain game="rps" radius="6px" />
      <style>{`
@keyframes rps-shake{0%,100%{transform:translateY(0) rotate(0deg)}25%{transform:translateY(-8px) rotate(-4deg)}75%{transform:translateY(-8px) rotate(4deg)}}
@keyframes rps-pop{0%{transform:scale(1)}45%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes rps-drop{0%{transform:translateY(-10px);opacity:0}100%{transform:translateY(0);opacity:1}}
@keyframes rps-slide-in{0%{transform:translateX(46px) scale(.9);opacity:0}100%{transform:translateX(0) scale(1);opacity:1}}
@keyframes rps-badge-shake{0%,100%{transform:translateX(0) scale(1.2)}20%{transform:translateX(-3px) scale(1.2)}40%{transform:translateX(3px) scale(1.2)}60%{transform:translateX(-2px) scale(1.2)}80%{transform:translateX(2px) scale(1.2)}}
.rps-rail::-webkit-scrollbar{height:0}
.rps-rail{overflow-anchor:none;overscroll-behavior-x:contain;touch-action:pan-x;scroll-behavior:auto;direction:rtl;-webkit-overflow-scrolling:touch}
.rps-rail > *{direction:ltr}
.rps-rail *{overflow-anchor:none}
`}</style>

      {/* Floating result pill — Stake-style console readout */}
      <div className="relative mb-1 flex justify-center pt-1">
        <div
          key={`${animationKey}-${phase}`}
          className={cn(
            "relative rounded-[8px] border px-4 py-2 text-center",
            phase === "SETTLED" && "motion-safe:[animation:dicePillLand_360ms_ease-out]",
          )}
          style={{
            background: "#0f212e",
            borderColor:
              phase !== "SETTLED"
                ? "rgba(255,255,255,.12)"
                : outcome === "WIN"
                  ? ARCADE_THEMES.rps.accent
                  : outcome === "LOSS"
                    ? "#ff4d5e"
                    : "#f5c451",
          }}
        >
          <div
            className="font-display text-[26px] font-black tabular-nums leading-none"
            style={{
              color:
                phase !== "SETTLED"
                  ? "rgba(255,255,255,.55)"
                  : outcome === "WIN"
                    ? ARCADE_THEMES.rps.accent
                    : outcome === "LOSS"
                      ? "#ff4d5e"
                      : "#f5c451",
            }}
          >
            {liveMultiplier.toFixed(2)}×
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
            {phase === "IDLE"
              ? "ready"
              : phase === "SETTLED"
                ? outcome === "WIN"
                  ? "win"
                  : outcome === "LOSS"
                    ? "bust"
                    : "push"
                : "revealing"}
          </div>
          <div
            className="absolute left-1/2 top-full h-2 w-[2px] -translate-x-1/2"
            style={{ background: "rgba(255,255,255,.2)" }}
          />
        </div>
      </div>


      {/* Rail — the active column is centred; history drifts left, next waits right. */}
      <div className="relative flex items-start justify-center gap-2 pb-0.5 pt-2">

        {/* Left: settled results — scrollable, most recent closest to the centre. */}
        <div className="rps-rail flex flex-1 items-start justify-start gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
          <div className="flex min-w-full items-start justify-end gap-2">

            {historyWithMultipliers.map((h) => (
              <RailCell
                key={h.id}
                scale="past"
                faceUp
                serverMove={h.server}
                playerMove={h.player}
                tone={h.outcome as Tone}
                active={false}
                shaking={false}
                multiplier={h.multiplier}
              />
            ))}
          </div>
        </div>

        {/* Centre: the live card. */}
        <div key={animationKey} className="animate-[rps-slide-in_0.45s_ease-out]">
          <RailCell
            scale="active"
            faceUp={!concealed}
            serverMove={serverMove}
            playerMove={concealed ? null : playerMove}
            tone={concealed ? null : (outcome as Tone)}
            active
            shaking={shaking}
            multiplier={liveMultiplier}
          />
        </div>

        {/* Right: the endless string of sleeping cards. */}
        <div className="flex flex-1 items-start justify-start gap-2 overflow-hidden">
          {nextMultipliers.map((m, i) => (
            <RailCell
              key={i}
              scale="next"
              faceUp={false}
              serverMove={null}
              playerMove={null}
              tone={null}
              active={false}
              shaking={false}
              multiplier={m}
              placeholder
            />
          ))}
        </div>
      </div>



      {/* Stat cells */}
      <div className="mx-auto mt-3 flex w-full max-w-[460px] items-stretch gap-2">
        <StatCell label="Multiplier" value={`${liveMultiplier.toFixed(2)}×`} tone="accent" />
        <StatCell label="Next" value={`${nextMultipliers[0].toFixed(2)}×`} />
        <StatCell label="Streak" value={`${runStep}`} />
      </div>

      {/* Status line */}
      <div
        className={cn(
          "mt-2 min-h-[12px] text-center font-display text-[10px] font-black uppercase tracking-[0.14em] transition-colors",
          phase === "SETTLED" ? toneText(outcome as Tone) : "text-white/35",
        )}
      >
        {phase === "IDLE"
          ? "Throw a hand to challenge"
          : phase === "SETTLED"
            ? outcome === "WIN"
              ? "You win"
              : outcome === "LOSS"
                ? "You lose"
                : "Draw"
            : "Revealing"}
      </div>

      {/* Console call-pads — flat slate keys with a neon-green live edge. */}
      <div className="mx-auto mt-3 grid w-full max-w-[460px] grid-cols-3 gap-2">
        {RPS_MOVES.map((m) => {
          const selected = playerMove === m;
          return (
            <button
              key={m}
              type="button"
              disabled={!canPlay}
              onClick={() => onChoose(m)}
              aria-label={m}
              className={cn(
                "group relative flex flex-col items-center gap-1.5 rounded-[6px] border px-2 py-3 transition-all duration-150",
                "active:translate-y-[1px] disabled:pointer-events-none disabled:opacity-40",
                selected ? "" : "hover:brightness-125",
              )}
              style={{
                background: selected
                  ? "color-mix(in srgb, var(--color-neon) 16%, #0f212e)"
                  : "#0f212e",
                borderColor: selected ? ARCADE_THEMES.rps.accent : "rgba(255,255,255,.08)",
                boxShadow: selected
                  ? `0 0 0 1px ${ARCADE_THEMES.rps.accent}, 0 0 18px -6px ${ARCADE_THEMES.rps.accent}`
                  : "inset 0 -2px 0 rgba(0,0,0,.35)",
              }}
            >
              <HandGlyph
                move={m}
                className={cn(
                  "h-8 w-8 transition-transform duration-150",
                  selected
                    ? "scale-110 text-[var(--color-neon)] animate-[rps-pop_0.3s_ease-out]"
                    : "text-white/70 group-hover:text-white",
                )}
              />
              <span
                className={cn(
                  "text-[9px] font-bold uppercase tracking-[0.16em]",
                  selected ? "text-[var(--color-neon)]" : "text-white/40",
                )}
              >
                {m === "SCISSORS" ? "Scissors" : m === "PAPER" ? "Paper" : "Rock"}
              </span>
            </button>
          );
        })}
      </div>




    </div>
  );
}

export const RpsArena = memo(RpsArenaImpl);
