import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { CsseCardBack } from "@/components/arcade/PlayingCard";
import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
import {
  HILO_RANKS,
  HILO_SUITS,
  hiloIsRed,
  hiloProbability,
  hiloStepMultiplier,
  type HiloGuess,
} from "@/lib/arcade/mini-math";

export type HiloCard = { rank: number; suit: number };

const T = ARCADE_THEMES.hilo;
const FLIP_MS = 420;

/**
 * Flat felt card with deal + flip — Hi-Lo ranks/suits (not BJ indexing).
 * Presentation only; every face comes from the server.
 */
function FeltCard({
  card,
  height = 108,
  dealKey,
  faceUp = true,
  slam = false,
}: {
  card: HiloCard | null;
  height?: number;
  dealKey: string;
  faceUp?: boolean;
  slam?: boolean;
}) {
  const w = Math.round(height * 0.7);
  const red = card ? hiloIsRed(card) : false;
  const hasFace = Boolean(card) && faceUp;
  const [flying, setFlying] = useState(hasFace);
  const [flipped, setFlipped] = useState(!hasFace);

  useEffect(() => {
    if (!hasFace) {
      setFlying(false);
      setFlipped(true);
      return;
    }
    setFlying(true);
    setFlipped(false);
    const slide = window.setTimeout(() => setFlying(false), 40);
    const flip = window.setTimeout(() => setFlipped(true), 280);
    return () => {
      window.clearTimeout(slide);
      window.clearTimeout(flip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dealKey is the reveal identity
  }, [dealKey]);

  const showFace = Boolean(card) && faceUp && flipped;

  return (
    <div
      className="relative shrink-0 select-none"
      style={{
        width: w,
        height,
        transform: flying
          ? "translate(56px, -20px) scale(0.94)"
          : slam
            ? "translate(0, 3px) rotate(-3deg)"
            : "translate(0, 0) scale(1)",
        transition: flying ? "none" : `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`,
        zIndex: flying ? 20 : 1,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-[8px] border border-black/25 shadow-[0_5px_0_rgba(0,0,0,.4)]"
        style={{ background: showFace ? "#f7efdd" : undefined }}
      >
        {showFace && card ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-between px-2 py-1.5",
              red ? "text-[#c8102e]" : "text-[#14100a]",
            )}
          >
            <span className="font-display text-[15px] font-black leading-none">
              {HILO_RANKS[card.rank]}
            </span>
            <span className="self-center font-display text-[28px] font-black leading-none">
              {HILO_SUITS[card.suit]}
            </span>
            <span className="self-end rotate-180 font-display text-[15px] font-black leading-none">
              {HILO_RANKS[card.rank]}
            </span>
          </div>
        ) : (
          <div className="absolute inset-0">
            {card || !faceUp ? (
              <CsseCardBack />
            ) : (
              <div
                className="grid h-full w-full place-items-center"
                style={{ background: "rgba(0,0,0,.2)" }}
              >
                <span className="font-display text-3xl font-black" style={{ color: T.accent }}>
                  ?
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Hi-Lo playfield — one felt composition: house mark, reference card, climb
 * readout, and the two call pads. Trail is a quiet footnote.
 */
export function HiloBoard({
  cards,
  multiplier,
  stake,
  canGuess,
  pendingGuess,
  onGuess,
  lostCard,
  stepCount = 0,
}: {
  cards: HiloCard[];
  multiplier: number;
  stake: number;
  canGuess: boolean;
  pendingGuess: HiloGuess | null;
  onGuess: (g: HiloGuess) => void;
  lostCard: HiloCard | null;
  stepCount?: number;
}) {
  const current = cards.length ? cards[cards.length - 1] : null;
  const rank = current?.rank ?? 6;
  const prevMult = useRef(multiplier);
  const [climbFlash, setClimbFlash] = useState(false);
  const [revealLocked, setRevealLocked] = useState(false);
  const revealKey = current
    ? `c-${cards.length}-${current.rank}-${current.suit}`
    : "empty";

  useEffect(() => {
    if (multiplier > prevMult.current && multiplier > 1) {
      setClimbFlash(true);
      const t = window.setTimeout(() => setClimbFlash(false), 520);
      prevMult.current = multiplier;
      return () => window.clearTimeout(t);
    }
    prevMult.current = multiplier;
  }, [multiplier]);

  useEffect(() => {
    if (!current || lostCard) {
      setRevealLocked(false);
      return;
    }
    setRevealLocked(true);
    const t = window.setTimeout(() => setRevealLocked(false), 360);
    return () => window.clearTimeout(t);
  }, [revealKey, current, lostCard]);

  const sides: { key: HiloGuess; label: string; hint: string }[] = [
    { key: "higher", label: "Higher", hint: "≥" },
    { key: "lower", label: "Lower", hint: "<" },
  ];

  return (
    <div
      className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[12px]"
      style={{
        background: `radial-gradient(120% 70% at 50% -10%, #3a2350 0%, ${T.feltOrBoardFill} 55%, #120a1a 100%)`,
      }}
    >
      {/* velvet spotlight */}
      <div
        className="pointer-events-none absolute left-1/2 top-0 h-[220px] w-[260px] -translate-x-1/2 motion-safe:[animation:hiloVelvetDrift_6s_ease-in-out_infinite]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(255,194,71,.22), rgba(255,194,71,0) 72%)",
        }}
        aria-hidden
      />

      {/* house watermark */}
      <div className="pointer-events-none absolute bottom-3 right-3 z-0 flex items-center gap-1.5 opacity-[0.14]">
        <CsseMark variant="mono" className="h-4 w-4 text-white" />
        <CsseWordmark
          size={9}
          className="[&_span]:[color:transparent!important] [&_span]:[-webkit-text-stroke:0.5px_rgba(255,255,255,0.6)!important]"
        />
      </div>

      <div className="relative z-10 flex gap-3 px-3 pb-4 pt-3">
        {/* climb ladder rail */}
        <div className="flex w-[54px] shrink-0 flex-col-reverse justify-end gap-1 pb-1">
          {Array.from({ length: 6 }, (_, i) => i).map((i) => {
            const done = i < stepCount;
            const isNext = i === stepCount;
            return (
              <div
                key={i}
                className={cn(
                  "h-[18px] origin-left rounded-[4px] border text-center text-[9px] font-black leading-[16px] tabular-nums",
                  done && "motion-safe:[animation:hiloRungLight_260ms_ease-out]",
                )}
                style={{
                  background: done ? "rgba(255,194,71,.22)" : "rgba(0,0,0,.3)",
                  borderColor: done
                    ? T.accent
                    : isNext
                      ? "rgba(255,194,71,.4)"
                      : "rgba(255,255,255,.08)",
                  color: done ? T.accent : "rgba(255,255,255,.3)",
                }}
              >
                {done ? `${i + 1}` : isNext ? "next" : ""}
              </div>
            );
          })}
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-center gap-3">
          {/* climb readout */}
          <div
            className={cn(
              "flex w-full flex-col items-center",
              climbFlash && "motion-safe:[animation:arcadeSettlePlaque_420ms_ease-out]",
            )}
          >
            <span
              className="font-display text-[34px] font-black tabular-nums leading-none"
              style={{ color: T.accent, textShadow: "0 0 18px rgba(255,194,71,.35)" }}
            >
              {multiplier.toFixed(2)}×
            </span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
              {stepCount > 0 ? `${stepCount} call${stepCount === 1 ? "" : "s"} · ` : "open · "}
              {(stake * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })} pts
            </span>
          </div>

          {/* cards */}
          <div className="flex items-end justify-center gap-4 py-1">
            <FeltCard key={revealKey} card={current} height={128} dealKey={revealKey} faceUp />
            {lostCard ? (
              <FeltCard
                key={`miss-${lostCard.rank}-${lostCard.suit}-${cards.length}`}
                card={lostCard}
                height={100}
                dealKey={`miss-${lostCard.rank}-${lostCard.suit}-${cards.length}`}
                slam
              />
            ) : null}
          </div>

          {/* call pads */}
          <div className="grid w-full grid-cols-2 gap-2">
            {sides.map((s) => {
              const p = hiloProbability(rank, s.key);
              const step = hiloStepMultiplier(rank, s.key);
              const dead = p <= 0;
              const disabled = !canGuess || dead || revealLocked;
              const pending = pendingGuess === s.key;
              const isHigh = s.key === "higher";
              const tint = isHigh ? T.accent : "#c48bff";
              return (
                <button
                  key={s.key}
                  type="button"
                  disabled={disabled}
                  onClick={() => onGuess(s.key)}
                  className={cn(
                    "group relative overflow-hidden rounded-[10px] border px-3 py-2.5 text-left transition-transform active:translate-y-[1px] disabled:opacity-40",
                    pending && "animate-pulse",
                  )}
                  style={{
                    background: `linear-gradient(180deg, ${tint}1f, rgba(0,0,0,.34))`,
                    borderColor: pending ? tint : `${tint}55`,
                    boxShadow: pending ? `0 0 16px ${tint}44` : "none",
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="font-display text-[15px] font-black leading-none"
                      style={{ color: tint }}
                      aria-hidden
                    >
                      {isHigh ? "▲" : "▼"}
                    </span>
                    <span
                      className="font-display text-[13px] font-black uppercase tracking-[0.12em]"
                      style={{ color: tint }}
                    >
                      {s.label}
                    </span>
                    <span className="ml-auto text-[10px] font-bold text-white/35">{s.hint}</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="font-display text-lg font-black tabular-nums text-white">
                      {dead ? "—" : `${step.toFixed(2)}×`}
                    </span>
                    <span className="text-[11px] font-bold tabular-nums text-white/45">
                      {(p * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div
                    className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full"
                    style={{ background: "rgba(255,255,255,.08)" }}
                  >
                    <div
                      className="h-full rounded-full transition-[width] duration-200"
                      style={{ width: `${Math.round(p * 100)}%`, background: tint }}
                    />
                  </div>
                </button>
              );
            })}
          </div>


        {/* quiet trail — no section label */}
        {cards.length > 0 ? (
          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
            {cards.map((c, i) => (
              <span
                key={`${i}-${c.rank}-${c.suit}`}
                className="shrink-0 font-display text-[11px] font-black tabular-nums"
                style={{
                  color: hiloIsRed(c)
                    ? i === cards.length - 1 && !lostCard
                      ? "#ffb0b0"
                      : "#c87070"
                    : i === cards.length - 1 && !lostCard
                      ? "#fff"
                      : "rgba(255,255,255,.45)",
                }}
              >
                {HILO_RANKS[c.rank]}
                {HILO_SUITS[c.suit]}
                {i < cards.length - 1 ? (
                  <span className="mx-0.5 text-white/20">·</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
