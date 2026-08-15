import { cn } from "@/lib/utils";
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

/**
 * Video Poker felt — five cards with hold toggles and the live paytable.
 * Display only: the server deals, draws and classifies every hand.
 */
export function PokerBoard({
  hand,
  holds,
  stage,
  category,
  stake,
  onToggleHold,
  disabled,
}: {
  /** Server card codes 0–51; empty before the first deal. */
  hand: number[];
  holds: number[];
  stage: "idle" | "deal" | "final";
  category: PokerCategory | null;
  stake: number;
  onToggleHold: (index: number) => void;
  disabled?: boolean;
}) {
  const paying = category && POKER_PAYTABLE[category] > 0 ? category : null;

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
                {POKER_CATEGORY_LABELS[c]}
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

      {/* hand */}
      <div className="flex items-end justify-center gap-1.5">
        {Array.from({ length: 5 }, (_, i) => {
          const card = hand[i];
          const face = card == null ? null : pokerCardFace(card);
          const held = holds.includes(i);
          const canHold = stage === "deal" && !disabled && card != null;
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
                  held && "-translate-y-1",
                )}
                style={{
                  boxShadow: held ? `0 0 0 2px ${T.accent}` : "none",
                  borderRadius: 8,
                }}
              >
                <PlayingCard
                  rank={face?.rank ?? null}
                  suit={face?.suit ?? null}
                  faceUp={face != null}
                  height={84}
                  className="mx-auto"
                />
              </button>
              <span
                className="w-full rounded-[4px] py-0.5 text-center text-[8px] font-black uppercase tracking-[0.18em]"
                style={{
                  background: held ? T.accent : "rgba(255,255,255,.05)",
                  color: held ? "#03210a" : "rgba(255,255,255,.35)",
                }}
              >
                Hold
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
