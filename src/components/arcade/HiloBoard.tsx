import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { CsseCardBack } from "@/components/arcade/PlayingCard";
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
 * Flat felt card with deal-from-shoe + flip — Hi-Lo ranks/suits (not BJ indexing).
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
  /** Remount key so a new card always deals + flips. */
  dealKey: string;
  faceUp?: boolean;
  /** Miss card: slight slam pose. */
  slam?: boolean;
}) {
  const w = Math.round(height * 0.7);
  const red = card ? hiloIsRed(card) : false;
  const [flying, setFlying] = useState(true);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlying(true);
    setFlipped(false);
    const slide = window.setTimeout(() => setFlying(false), 40);
    const flip = window.setTimeout(() => {
      if (faceUp && card) setFlipped(true);
    }, 280);
    return () => {
      window.clearTimeout(slide);
      window.clearTimeout(flip);
    };
  }, [dealKey, faceUp, card]);

  const showFace = Boolean(card) && faceUp && flipped;

  return (
    <div
      className="relative shrink-0 select-none"
      style={{
        width: w,
        height,
        transform: flying
          ? "translate(72px, -28px) scale(0.94)"
          : slam
            ? "translate(0, 4px) rotate(-4deg)"
            : "translate(0, 0) scale(1)",
        transition: flying
          ? "none"
          : `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`,
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
                style={{ background: T.feltOrBoardFill }}
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

function MiniTrailCard({ card, active }: { card: HiloCard; active?: boolean }) {
  const red = hiloIsRed(card);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-[4px] border"
      style={{
        width: 22,
        height: 30,
        background: "#f7efdd",
        borderColor: active ? T.accent : "rgba(0,0,0,.35)",
        boxShadow: active ? `0 0 0 1px ${T.accent}` : undefined,
      }}
    >
      <span
        className="absolute left-0.5 top-0 text-[8px] font-black leading-none"
        style={{ color: red ? "#c8102e" : "#14100a" }}
      >
        {HILO_RANKS[card.rank]}
      </span>
      <span
        className="absolute inset-0 grid place-items-center text-[10px] font-black"
        style={{ color: red ? "#c8102e" : "#14100a" }}
      >
        {HILO_SUITS[card.suit]}
      </span>
    </div>
  );
}

/**
 * Hi-Lo playfield: felt table, shoe, dealing cards, climb rail, and call pads.
 * Presentation only — cards and payouts are server-authored.
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
  /** Card that ended the run, shown beside the reference card. */
  lostCard: HiloCard | null;
  stepCount?: number;
}) {
  const shoeRef = useRef<HTMLDivElement | null>(null);
  const current = cards.length ? cards[cards.length - 1] : null;
  const rank = current?.rank ?? 6;
  const prevMult = useRef(multiplier);
  const [climbFlash, setClimbFlash] = useState(false);

  useEffect(() => {
    if (multiplier > prevMult.current && multiplier > 1) {
      setClimbFlash(true);
      const t = window.setTimeout(() => setClimbFlash(false), 520);
      prevMult.current = multiplier;
      return () => window.clearTimeout(t);
    }
    prevMult.current = multiplier;
  }, [multiplier]);

  const sides: {
    key: HiloGuess;
    label: string;
    hint: string;
    arrow: string;
  }[] = [
    { key: "higher", label: "Higher", hint: "or equal", arrow: "▲" },
    { key: "lower", label: "Lower", hint: "strictly", arrow: "▼" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[460px] flex-col items-center gap-3 px-3 py-2">
      {/* climb rail */}
      <div
        className={cn(
          "relative flex w-full items-stretch overflow-hidden rounded-[10px] border",
          climbFlash && "motion-safe:[animation:arcadeSettlePlaque_420ms_ease-out]",
        )}
        style={{
          background: T.hud.plaqueBg,
          borderColor: climbFlash ? T.accent : T.hud.plaqueBorder,
        }}
      >
        <div
          className="flex w-[72px] shrink-0 flex-col items-center justify-center border-r px-2 py-2"
          style={{ borderColor: T.hud.plaqueBorder, background: "rgba(0,0,0,.22)" }}
        >
          <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Climb
          </span>
          <span className="font-display text-lg font-black tabular-nums" style={{ color: T.accent }}>
            {stepCount}
          </span>
        </div>
        <div className="flex flex-1 items-center justify-between px-3 py-2">
          <div className="leading-tight">
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Multiplier
            </div>
            <div
              className="font-display text-[22px] font-black tabular-nums leading-none"
              style={{ color: T.accent }}
            >
              {multiplier.toFixed(2)}×
            </div>
          </div>
          <div className="text-right leading-tight">
            <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              Bankable
            </div>
            <div className="font-display text-[22px] font-black tabular-nums leading-none text-[var(--color-ink)]">
              {(stake * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>
      </div>

      {/* felt table */}
      <div
        className="relative w-full overflow-hidden rounded-[14px] border px-3 pb-3 pt-4"
        style={{
          background: T.feltOrBoardFill,
          borderColor: T.railColor,
          boxShadow: `inset 0 0 0 1px ${T.rimMetal}33`,
        }}
      >
        {/* soft felt arcs */}
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-30"
          viewBox="0 0 400 200"
          aria-hidden
        >
          <path
            d="M20 20 C20 140 120 180 200 180 C280 180 380 140 380 20"
            fill="none"
            stroke={T.accent}
            strokeOpacity="0.35"
            strokeWidth="1.2"
          />
          <path
            d="M48 20 C48 120 130 158 200 158 C270 158 352 120 352 20"
            fill="none"
            stroke="rgba(255,255,255,.12)"
            strokeWidth="1"
          />
        </svg>

        <div className="relative flex items-end justify-center gap-4">
          {/* shoe */}
          <div ref={shoeRef} className="relative mb-1 shrink-0" aria-hidden>
            <div
              className="absolute left-1 top-1 h-[72px] w-[50px] rounded-[6px] border border-black/30 opacity-50"
              style={{ background: "#0f3d2c" }}
            />
            <div
              className="absolute left-0.5 top-0.5 h-[72px] w-[50px] rounded-[6px] border border-black/30 opacity-70"
              style={{ background: "#0f3d2c" }}
            />
            <div className="relative h-[72px] w-[50px] overflow-hidden rounded-[6px] border border-black/25 shadow-[0_4px_0_rgba(0,0,0,.35)]">
              <CsseCardBack />
            </div>
            <div
              className="mt-1 text-center text-[7px] font-bold uppercase tracking-[0.18em]"
              style={{ color: T.rimMetal }}
            >
              Shoe
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              Reference
            </span>
            <FeltCard
              card={current}
              height={118}
              dealKey={
                current
                  ? `c-${cards.length}-${current.rank}-${current.suit}`
                  : "empty"
              }
              faceUp={Boolean(current)}
            />
          </div>

          {lostCard ? (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-[#ff8a8a]">
                Miss
              </span>
              <FeltCard
                card={lostCard}
                height={96}
                dealKey={`miss-${lostCard.rank}-${lostCard.suit}`}
                slam
              />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1 opacity-40">
              <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                Next
              </span>
              <FeltCard card={null} height={96} dealKey="next-slot" faceUp={false} />
            </div>
          )}
        </div>
      </div>

      {/* call pads — asymmetric Higher / Lower instruments */}
      <div className="grid w-full grid-cols-2 gap-2.5">
        {sides.map((s) => {
          const p = hiloProbability(rank, s.key);
          const step = hiloStepMultiplier(rank, s.key);
          const dead = p <= 0;
          const disabled = !canGuess || dead;
          const pending = pendingGuess === s.key;
          const isHigh = s.key === "higher";
          return (
            <button
              key={s.key}
              type="button"
              disabled={disabled}
              onClick={() => onGuess(s.key)}
              className={cn(
                "relative overflow-hidden rounded-[12px] border px-3 py-3 text-left transition-transform active:translate-y-[1px] disabled:opacity-40",
                pending && "animate-pulse",
              )}
              style={{
                background: isHigh
                  ? "linear-gradient(180deg, #2a1c0e 0%, #1a1208 100%)"
                  : "linear-gradient(180deg, #1a1418 0%, #120e12 100%)",
                borderColor: pending ? T.accent : isHigh ? `${T.accent}88` : "rgba(180,140,160,.35)",
              }}
            >
              <div
                className="pointer-events-none absolute -right-1 -top-2 font-display text-[42px] font-black leading-none opacity-15"
                style={{ color: isHigh ? T.accent : "#c9a0b0" }}
              >
                {s.arrow}
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="font-display text-[15px] font-black uppercase tracking-[0.1em]"
                  style={{ color: isHigh ? T.accent : "#e8c4d0" }}
                >
                  {s.label}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                  {s.hint}
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="font-display text-xl font-black tabular-nums text-[var(--color-ink)]">
                  {dead ? "—" : `${step.toFixed(2)}×`}
                </span>
                <span className="rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-[var(--color-ink-muted)]"
                  style={{ borderColor: T.hud.plaqueBorder, background: "rgba(0,0,0,.25)" }}
                >
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* card rail */}
      <div className="flex w-full flex-col gap-1">
        <div className="text-[8px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
          Trail
        </div>
        <div className="flex h-9 w-full items-center gap-1 overflow-x-auto pb-0.5">
          {cards.length === 0 ? (
            <span className="text-[10px] text-[var(--color-ink-muted)]">Deal to start the climb</span>
          ) : (
            cards.map((c, i) => (
              <MiniTrailCard
                key={`${i}-${c.rank}-${c.suit}`}
                card={c}
                active={i === cards.length - 1 && !lostCard}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
