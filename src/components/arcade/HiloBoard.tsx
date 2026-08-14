import { cn } from "@/lib/utils";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
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

function CardFace({ card, size = 96 }: { card: HiloCard | null; size?: number }) {
  const red = card ? hiloIsRed(card) : false;
  return (
    <div
      className="relative grid place-items-center rounded-[10px] border shadow-[0_6px_0_rgba(0,0,0,.35)]"
      style={{
        width: size * 0.7,
        height: size,
        background: card ? "#f7efdd" : T.feltOrBoardFill,
        borderColor: card ? "rgba(0,0,0,.2)" : T.hud.plaqueBorder,
      }}
    >
      {card ? (
        <>
          <span
            className="absolute left-1.5 top-1 font-display text-[13px] font-black leading-none"
            style={{ color: red ? "#c8102e" : "#14100a" }}
          >
            {HILO_RANKS[card.rank]}
          </span>
          <span
            className="font-display text-2xl font-black leading-none"
            style={{ color: red ? "#c8102e" : "#14100a" }}
          >
            {HILO_SUITS[card.suit]}
          </span>
          <span
            className="absolute bottom-1 right-1.5 rotate-180 font-display text-[13px] font-black leading-none"
            style={{ color: red ? "#c8102e" : "#14100a" }}
          >
            {HILO_RANKS[card.rank]}
          </span>
        </>
      ) : (
        <span className="font-display text-2xl font-black" style={{ color: T.accent }}>
          ?
        </span>
      )}
    </div>
  );
}

/**
 * Hi-Lo playfield: the reference card, the two call buttons with their real
 * chances, and the trail of cards already turned over.
 * Presentation only — every card and payout comes from the server.
 */
export function HiloBoard({
  cards,
  multiplier,
  stake,
  canGuess,
  pendingGuess,
  onGuess,
  lostCard,
}: {
  cards: HiloCard[];
  multiplier: number;
  stake: number;
  canGuess: boolean;
  pendingGuess: HiloGuess | null;
  onGuess: (g: HiloGuess) => void;
  /** Card that ended the run, shown beside the reference card. */
  lostCard: HiloCard | null;
}) {
  const current = cards.length ? cards[cards.length - 1] : null;
  const rank = current?.rank ?? 6;

  const sides: { key: HiloGuess; label: string; hint: string }[] = [
    { key: "higher", label: "Higher", hint: "or equal" },
    { key: "lower", label: "Lower", hint: "strictly" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[430px] flex-col items-center gap-3 px-3 py-2">
      {/* running multiplier rail */}
      <div
        className="flex w-full items-center justify-between rounded-[8px] border px-3 py-2"
        style={{ background: T.hud.plaqueBg, borderColor: T.hud.plaqueBorder }}
      >
        <div className="leading-tight">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Multiplier
          </div>
          <div className="font-display text-lg font-black tabular-nums" style={{ color: T.accent }}>
            {multiplier.toFixed(2)}×
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Collect value
          </div>
          <div className="font-display text-lg font-black tabular-nums text-[var(--color-ink)]">
            {(stake * multiplier).toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* cards */}
      <div className="flex items-end justify-center gap-3">
        <CardFace card={current} size={112} />
        <CardFace card={lostCard} size={92} />
      </div>

      {/* call buttons */}
      <div className="grid w-full grid-cols-2 gap-2">
        {sides.map((s) => {
          const p = hiloProbability(rank, s.key);
          const step = hiloStepMultiplier(rank, s.key);
          const dead = p <= 0;
          const disabled = !canGuess || dead;
          return (
            <button
              key={s.key}
              type="button"
              disabled={disabled}
              onClick={() => onGuess(s.key)}
              className={cn(
                "rounded-[10px] border px-3 py-2.5 text-left transition-transform active:translate-y-[1px] disabled:opacity-40",
                pendingGuess === s.key && "animate-pulse",
              )}
              style={{
                background: T.feltOrBoardFill,
                borderColor: pendingGuess === s.key ? T.accent : T.hud.plaqueBorder,
              }}
            >
              <div className="flex items-baseline justify-between">
                <span
                  className="font-display text-sm font-black uppercase tracking-[0.08em]"
                  style={{ color: T.accent }}
                >
                  {s.label}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-ink-muted)]">
                  {s.hint}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between">
                <span className="font-display text-base font-black tabular-nums text-[var(--color-ink)]">
                  {dead ? "—" : `${(step).toFixed(2)}×`}
                </span>
                <span className="text-[10px] font-bold tabular-nums text-[var(--color-ink-muted)]">
                  {(p * 100).toFixed(1)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* trail */}
      <div className="flex h-6 w-full items-center gap-1 overflow-x-auto">
        {cards.map((c, i) => (
          <span
            key={`${i}-${c.rank}-${c.suit}`}
            className="shrink-0 rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
            style={{
              background: T.hud.plaqueBg,
              borderColor: T.hud.plaqueBorder,
              color: hiloIsRed(c) ? "#ff8a8a" : "var(--color-ink)",
            }}
          >
            {HILO_RANKS[c.rank]}
            {HILO_SUITS[c.suit]}
          </span>
        ))}
      </div>
    </div>
  );
}
