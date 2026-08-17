import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { CsseCardBack } from "@/components/arcade/PlayingCard";
import { ArcadeHouseMark } from "@/components/arcade/ArcadeHouseMark";
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
const LOSS = "#ff4d5e";
const FLIP_MS = 420;

/** Slate-console card face — deal slide then flip. Presentation only. */
function ConsoleCard({
  card,
  height = 116,
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
          ? "translate(48px, -18px) scale(0.94)"
          : slam
            ? "translate(0, 3px) rotate(-3deg)"
            : "translate(0, 0) scale(1)",
        transition: flying ? "none" : `transform ${FLIP_MS}ms cubic-bezier(.2,.8,.2,1)`,
        zIndex: flying ? 20 : 1,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden rounded-[8px] border"
        style={{
          background: showFace ? "#ffffff" : "#0f212e",
          borderColor: "rgba(0,0,0,.4)",
          boxShadow: "0 4px 10px rgba(0,0,0,.45)",
        }}
      >
        {showFace && card ? (
          <div
            className={cn(
              "absolute inset-0 flex flex-col justify-between px-2 py-1.5",
              red ? "text-[#e9113c]" : "text-[#0f212e]",
            )}
          >
            <span className="font-display text-[15px] font-black leading-none">
              {HILO_RANKS[card.rank]}
            </span>
            <span className="self-center font-display text-[30px] font-black leading-none">
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
              <div className="grid h-full w-full place-items-center">
                <span className="font-display text-3xl font-black text-white/25">?</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "loss";
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
        style={{ color: tone === "accent" ? T.accent : tone === "loss" ? LOSS : "#ffffff" }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Hi-Lo playfield — Stake-style slate console matching Dice: floating
 * multiplier pill, card row, split higher/lower call pads with probability
 * rails, and live stat cells. Presentation only.
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
  const revealKey = current ? `c-${cards.length}-${current.rank}-${current.suit}` : "empty";

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

  const pHigher = hiloProbability(rank, "higher");
  const pLower = hiloProbability(rank, "lower");
  const sides: { key: HiloGuess; label: string; hint: string }[] = [
    { key: "higher", label: "Higher", hint: "≥" },
    { key: "lower", label: "Lower", hint: "<" },
  ];

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-4 pb-4 pt-3"
      style={{
        background: T.feltOrBoardFill,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.06), inset 0 0 0 8px ${T.stageBg}`,
      }}
    >
      <ArcadeHouseMark opacity={0.5} />
      {/* result pill */}
      <div className="relative z-10 flex h-[76px] items-start justify-center">
        <div
          className={cn(
            "rounded-[8px] border px-4 py-2 text-center",
            climbFlash && "motion-safe:[animation:dicePillLand_360ms_ease-out]",
            lostCard && "motion-safe:[animation:diceTrackShock_260ms_ease-out]",
          )}
          style={{
            background: "#0f212e",
            borderColor: lostCard ? LOSS : multiplier > 1 ? T.accent : "rgba(255,255,255,.12)",
            boxShadow: lostCard
              ? "0 0 0 1px rgba(255,77,94,.25)"
              : multiplier > 1
                ? "0 0 0 1px rgba(0,231,1,.25)"
                : "none",
          }}
        >
          <div
            className="font-display text-[26px] font-black tabular-nums leading-none"
            style={{
              color: lostCard ? LOSS : multiplier > 1 ? T.accent : "rgba(255,255,255,.55)",
            }}
          >
            {multiplier.toFixed(2)}×
          </div>
          <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
            {lostCard
              ? "bust"
              : stepCount > 0
                ? `${stepCount} call${stepCount === 1 ? "" : "s"}`
                : "ready"}
          </div>
        </div>
      </div>

      {/* cards */}
      <div className="flex items-end justify-center gap-4">
        <ConsoleCard key={revealKey} card={current} height={124} dealKey={revealKey} faceUp />
        {lostCard ? (
          <ConsoleCard
            key={`miss-${lostCard.rank}-${lostCard.suit}-${cards.length}`}
            card={lostCard}
            height={100}
            dealKey={`miss-${lostCard.rank}-${lostCard.suit}-${cards.length}`}
            slam
          />
        ) : null}
      </div>

      {/* split probability rail */}
      <div
        className="relative mt-3 h-[18px] w-full overflow-hidden rounded-full"
        style={{ background: LOSS, boxShadow: "inset 0 2px 4px rgba(0,0,0,.45)" }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-200"
          style={{ width: `${Math.round(pHigher * 100)}%`, background: T.accent }}
        />
      </div>
      <div className="mt-1.5 flex justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
          Higher {(pHigher * 100).toFixed(0)}%
        </span>
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/30">
          Lower {(pLower * 100).toFixed(0)}%
        </span>
      </div>

      {/* call pads */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {sides.map((s) => {
          const p = hiloProbability(rank, s.key);
          const step = hiloStepMultiplier(rank, s.key);
          const dead = p <= 0;
          const disabled = !canGuess || dead || revealLocked;
          const pending = pendingGuess === s.key;
          const isHigh = s.key === "higher";
          const tint = isHigh ? T.accent : LOSS;
          return (
            <button
              key={s.key}
              type="button"
              disabled={disabled}
              onClick={() => onGuess(s.key)}
              className={cn(
                "relative overflow-hidden rounded-[6px] border px-3 py-2.5 text-left transition-transform active:translate-y-[1px] disabled:opacity-40",
                pending && "animate-pulse",
              )}
              style={{
                background: "#0f212e",
                borderColor: pending ? tint : "rgba(255,255,255,.08)",
                boxShadow: pending ? `0 0 12px ${tint}44` : "none",
              }}
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="font-display text-[13px] font-black leading-none"
                  style={{ color: tint }}
                  aria-hidden
                >
                  {isHigh ? "▲" : "▼"}
                </span>
                <span
                  className="text-[9px] font-bold uppercase tracking-[0.16em]"
                  style={{ color: tint }}
                >
                  {s.label}
                </span>
                <span className="ml-auto text-[10px] font-bold text-white/30">{s.hint}</span>
              </div>
              <div className="mt-1.5 font-display text-[17px] font-black tabular-nums leading-none text-white">
                {dead ? "—" : `${step.toFixed(2)}×`}
              </div>
            </button>
          );
        })}
      </div>

      {/* stat cells */}
      <div className="mt-3 flex items-stretch gap-2">
        <StatCell label="Mult" value={`${multiplier.toFixed(4)}×`} tone="accent" />
        <StatCell
          label="Payout"
          value={(stake * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
        />
        <StatCell label="Calls" value={`${stepCount}`} />
      </div>

      {/* quiet trail */}
      {cards.length > 0 ? (
        <div className="mt-2 flex max-w-full items-center gap-1 overflow-x-auto">
          {cards.map((c, i) => (
            <span
              key={`${i}-${c.rank}-${c.suit}`}
              className="shrink-0 font-display text-[11px] font-black tabular-nums"
              style={{
                color:
                  i === cards.length - 1 && !lostCard ? "#ffffff" : "rgba(255,255,255,.35)",
              }}
            >
              {HILO_RANKS[c.rank]}
              {HILO_SUITS[c.suit]}
              {i < cards.length - 1 ? <span className="mx-0.5 text-white/20">·</span> : null}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
