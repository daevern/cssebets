import { cn } from "@/lib/utils";
import { rankLabel, suitSymbol, isRedSuit } from "@/lib/arcade/blackjack-math";
import { PlayingCard } from "@/components/arcade/PlayingCard";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import {
  POKER_CATEGORY_LABELS,
  POKER_PAYTABLE,
  POKER_PAY_ROWS,
  pokerCardFace,
  type PokerCategory,
} from "@/lib/arcade/mini-math";

const T = ARCADE_THEMES.poker;

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
  const paying = category && POKER_PAYTABLE[category] > 0 ? category : null;
  const isFinal = stage === "final" && revealed;


  return (
    <div
      className="relative mx-auto w-full max-w-[460px] overflow-hidden rounded-[10px] px-3 pb-3 pt-3"
      style={{ background: T.feltOrBoardFill }}
    >
      {/* paytable */}
      <div
        className="mb-3 grid grid-cols-3 gap-1 rounded-[6px] border p-1.5 sm:grid-cols-3"
        style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
      >
        {POKER_PAY_ROWS.map((c) => {
          const hit = paying === c;
          return (
            <div
              key={c}
              className="flex min-w-0 items-center justify-between gap-1 rounded-[4px] px-1.5 py-1"
              style={{ background: hit ? "rgba(0,231,1,.14)" : "transparent" }}
            >
              <span className="truncate text-[9px] font-bold uppercase tracking-[0.06em] text-white/45">
                {SHORT[c] ?? POKER_CATEGORY_LABELS[c]}
              </span>
              <span
                className="font-display text-[11px] font-black tabular-nums"
                style={{ color: hit ? T.accent : "rgba(255,255,255,.7)" }}
              >
                {POKER_PAYTABLE[c]}×
              </span>
            </div>
          );
        })}
      </div>

      {/* dealt-hand recap so the swap is visible after the draw */}
      {isFinal && dealt && dealt.length === 5 ? (
        <div
          className="mb-2 flex items-center justify-center gap-2 rounded-[6px] border px-2 py-1"
          style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
        >
          <span className="text-[8px] font-black uppercase tracking-[0.16em] text-white/35">
            Dealt
          </span>
          {dealt.map((c, i) => {
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
      ) : null}

      {/* hand */}
      <div className="flex items-end justify-center gap-1.5">
        {Array.from({ length: 5 }, (_, i) => {
          const card = hand[i];
          const face = card == null ? null : pokerCardFace(card);
          const held = holds.includes(i);
          const canHold = stage === "deal" && !disabled && card != null;
          const replaced = isFinal && card != null && !held;
          return (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!canHold}
                onClick={() => onToggleHold(i)}
                aria-pressed={held}
                aria-label={`Card ${i + 1}${held ? " held" : ""}`}
                className={cn(
                  "w-full rounded-[6px] transition-transform",
                  canHold && "active:scale-95",
                  held && !isFinal && "-translate-y-1",
                )}
                style={{
                  boxShadow: held && !isFinal ? `0 0 0 2px ${T.accent}` : "none",
                  borderRadius: 8,
                }}
              >
                <div
                  key={`${i}-${card ?? "x"}-${stage}`}
                  style={
                    replaced
                      ? {
                          animation: `pokerDrawFlip 420ms ${i * 80}ms cubic-bezier(.2,.7,.3,1) both, pokerNewPulse 900ms ${i * 80 + 300}ms ease-out`,
                          borderRadius: 8,
                        }
                      : undefined
                  }
                >
                  <PlayingCard
                    rank={face?.rank ?? null}
                    suit={face?.suit ?? null}
                    faceUp={face != null}
                    height={84}
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
                      ? "#03210a"
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
        className="mt-3 flex items-center justify-between gap-2 rounded-[6px] border px-3 py-2"
        style={{ background: "#0f212e", borderColor: "rgba(255,255,255,.08)" }}
      >
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/40">
          {stage === "final" ? "Result" : stage === "deal" ? "Hold and draw" : "Deal to begin"}
        </span>
        <span
          className="font-display text-[14px] font-black tabular-nums"
          style={{ color: paying ? T.accent : "#ffffff" }}
        >
          {category
            ? `${POKER_CATEGORY_LABELS[category]}${
                paying ? ` · ${(POKER_PAYTABLE[category] * stake).toFixed(2)}` : ""
              }`
            : "—"}
        </span>
      </div>
    </div>
  );
}

