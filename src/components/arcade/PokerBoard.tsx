import { useRef } from "react";
import { cn } from "@/lib/utils";
import { rankLabel, suitSymbol, isRedSuit } from "@/lib/arcade/blackjack-math";
import { PlayingCard } from "@/components/arcade/PlayingCard";
import { ArcadeHouseMark } from "@/components/arcade/ArcadeHouseMark";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import {
  POKER_CATEGORY_LABELS,
  POKER_PAYTABLE,
  POKER_PAY_ROWS,
  pokerCardFace,
  type PokerCategory,
} from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.poker;
const INK = "#06140e";

/** Compact paytable labels so nine rows fit a phone without truncating. */
const SHORT: Record<string, string> = {
  royal_flush: "Royal",
  straight_flush: "Str flush",
  four: "Quads",
  full_house: "Full house",
  flush: "Flush",
  straight: "Straight",
  three: "Trips",
  two_pair: "Two pair",
  jacks_or_better: "Jacks+",
};

/**
 * Video Poker felt — five cards with hold toggles and the live paytable.
 * Display only: the server deals, draws and classifies every hand.
 */
export function PokerBoard({
  hand,
  dealt,
  holds,
  stage,
  category,
  stake,
  onToggleHold,
  disabled,
  roundKey,
  revealed = true,
}: {
  /** Server card codes 0–51; empty before the first deal. */
  hand: number[];
  /** The pre-draw hand, so replaced cards can be shown side by side. */
  dealt?: number[];
  holds: number[];
  stage: "idle" | "deal" | "final";
  category: PokerCategory | null;
  stake: number;
  onToggleHold: (index: number) => void;
  disabled?: boolean;
  /** Changes per round so cards remount and re-deal. */
  roundKey?: string;
  /** False while the draw flip is still playing — hides the outcome. */
  revealed?: boolean;
}) {
  const deckRef = useRef<HTMLDivElement | null>(null);
  const paying =
    revealed && category && POKER_PAYTABLE[category] > 0 ? category : null;

  const isFinal = stage === "final" && revealed;

  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-3 pb-3 pt-3"
      style={{
        background: T.feltOrBoardFill,
        boxShadow: `inset 0 0 0 1px rgba(255,255,255,.06), inset 0 0 0 8px ${T.stageBg}`,
      }}
    >
      <ArcadeHouseMark opacity={0.5} className="top-[58%]" />

      <div
        className="relative z-10 mb-4 grid grid-cols-3 gap-1 rounded-[6px] border p-1.5"
        style={{ background: T.stageBg, borderColor: "rgba(255,255,255,.08)" }}
      >
        {POKER_PAY_ROWS.map((c) => {
          const hit = paying === c;
          return (
            <div
              key={c}
              className="flex min-w-0 items-center justify-between gap-1 rounded-[4px] px-1.5 py-1"
              style={{ background: hit ? `${T.accent}24` : "transparent" }}
            >
              <span className="truncate text-[9px] font-bold uppercase tracking-[0.06em] text-white/40">
                {SHORT[c] ?? POKER_CATEGORY_LABELS[c]}
              </span>
              <span
                className="font-display text-[11px] font-black tabular-nums"
                style={{ color: hit ? T.accent : "rgba(255,255,255,.55)" }}
              >
                {POKER_PAYTABLE[c]}×
              </span>
            </div>
          );
        })}
      </div>

      {/* Height is reserved from the first deal so the stage never rescales
          mid-reveal; the row only fades in once the hand is settled. */}
      <div
        className="relative z-10 mb-3 flex h-[26px] items-center justify-center gap-2 rounded-[6px] border px-2 transition-opacity duration-200"
        style={{
          background: T.stageBg,
          borderColor: "rgba(255,255,255,.08)",
          opacity: isFinal && dealt && dealt.length === 5 ? 1 : 0,
        }}
        aria-hidden={!isFinal}
      >
        <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">
          Dealt
        </span>
        {(dealt && dealt.length === 5 ? dealt : []).map((c, i) => {
          const f = pokerCardFace(c);
          const kept = holds.includes(i);
          return (
            <span
              key={`${i}-${c}`}
              className="font-mono text-[11px] font-bold tabular-nums"
              style={{
                color: kept
                  ? isRedSuit(f.suit)
                    ? "#ff8a8a"
                    : "rgba(255,255,255,.8)"
                  : "rgba(255,255,255,.28)",
                textDecoration: kept ? "none" : "line-through",
              }}
            >
              {rankLabel(f.rank)}
              {suitSymbol(f.suit)}
            </span>
          );
        })}
      </div>

      {/* Deck marker — the fixed point every card slides out of. */}
      <div
        ref={deckRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[46%] h-[84px] w-[59px] -translate-x-1/2 opacity-0"
      />

      <div className="relative z-10 flex h-[104px] items-end justify-center gap-2 px-1">
        {Array.from({ length: 5 }, (_, i) => {
          const card = hand[i];
          const face = card == null ? null : pokerCardFace(card);
          const held = holds.includes(i);
          const canHold = stage === "deal" && !disabled && card != null;
          const isDraw = stage === "final" && card != null && !held;
          const dealDelay = stage === "final" ? i * 130 : i * 110;
          const flipAt = dealDelay + 560;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!canHold}
                onClick={() => onToggleHold(i)}
                aria-pressed={held}
                aria-label={`Card ${i + 1}${held ? " held" : ""}`}
                className={cn(
                  "w-full rounded-[6px] transition-[box-shadow,margin] duration-150",
                  canHold && "active:opacity-80",
                )}
                style={{
                  marginBottom: held && !isFinal ? 4 : 0,
                  boxShadow: held && !isFinal ? `0 0 0 2px ${T.accent}` : "none",
                  borderRadius: 8,
                }}
              >
                {/* Single animation owner: PlayingCard handles slide + flip.
                    A replaced card remounts (new key) and re-deals; a held
                    card keeps its key and stays perfectly still. */}
                <div
                  key={`${i}-${card ?? "x"}-${roundKey ?? ""}`}
                  className="rounded-[8px]"
                  style={
                    isDraw
                      ? { boxShadow: `0 0 0 2px rgba(255,183,3,.55)` }
                      : undefined
                  }
                >
                  <PlayingCard
                    rank={face?.rank ?? null}
                    suit={face?.suit ?? null}
                    faceUp={face != null}
                    height={84}
                    dealFrom={deckRef}
                    dealDelay={dealDelay}
                    flipDelay={flipAt}
                    className="mx-auto"
                  />
                </div>
              </button>


              <span
                className="w-full rounded-[4px] py-0.5 text-center text-[8px] font-black uppercase tracking-[0.18em]"
                style={{
                  background: isFinal
                    ? held
                      ? "rgba(255,255,255,.12)"
                      : "#ffb703"
                    : held
                      ? T.accent
                      : "rgba(255,255,255,.05)",
                  color: isFinal
                    ? held
                      ? "rgba(255,255,255,.6)"
                      : "#2a1a00"
                    : held
                      ? INK
                      : "rgba(255,255,255,.35)",
                }}
              >
                {isFinal ? (held ? "Kept" : "New") : "Hold"}
              </span>
            </div>
          );
        })}
      </div>

      <div
        className="relative z-10 mt-3 flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2"
        style={{ background: T.stageBg, borderColor: "rgba(255,255,255,.08)" }}
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
          {stage === "final"
            ? revealed
              ? "Result"
              : "Drawing…"
            : stage === "deal"
              ? "Hold and draw"
              : "Deal to begin"}
        </span>
        <span
          className="font-display text-[14px] font-black tabular-nums"
          style={{ color: paying ? T.accent : "#ffffff" }}
        >
          {revealed && category
            ? `${POKER_CATEGORY_LABELS[category]}${
                paying ? ` · ${(POKER_PAYTABLE[category] * stake).toFixed(2)}` : ""
              }`
            : "—"}
        </span>
      </div>
    </div>
  );
}
