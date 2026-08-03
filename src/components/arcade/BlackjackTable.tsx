import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PlayingCard } from "@/components/arcade/PlayingCard";
import { CsseMark } from "@/components/brand/CsseMark";
import { formatTotal, handValue } from "@/lib/arcade/blackjack-math";
import type { BjCard } from "@/lib/arcade/blackjack.functions";

export type BlackjackState = {
  hand: any;
  playerHands: any[];
  cards: BjCard[];
};

function Totals({ label, value, tone }: { label: string; value: string; tone?: "neon" | "muted" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 items-center text-[9px] font-bold uppercase leading-none tracking-[0.32em] text-[var(--color-ink)]">
        {label}
      </span>
      <span
        className={cn(
          "flex h-7 min-w-11 items-center justify-center rounded-[3px] border px-3 text-center font-mono text-[12px] font-bold leading-none tabular-nums",
          tone === "neon"
            ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
            : "border-[var(--color-surface-border)] bg-[#0b1a12] text-[var(--color-ink)]",
        )}
      >
        {value}
      </span>
    </div>
  );
}


/** Decorative casino felt: arcs, curved rule banners and a card shoe. */
function FeltArt() {
  const neon = "var(--color-neon)";
  return (
    <svg
      viewBox="0 -70 1180 670"
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <path id="bj-arc-left" d="M150,300 C185,430 350,500 590,500" fill="none" />
        <path id="bj-arc-right" d="M590,500 C830,500 995,430 1030,300" fill="none" />
        <path id="bj-arc-banner" d="M300,268 C420,352 760,352 880,268" fill="none" />
      </defs>

      {/* Main table arc */}
      <path
        d="M62,-40 C62,340 300,520 590,520 C880,520 1118,340 1118,-40"
        fill="none"
        stroke={neon}
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      {/* Inner arc */}
      <path
        d="M118,-40 C118,320 320,472 590,472 C860,472 1062,320 1062,-40"
        fill="none"
        stroke={neon}
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />

      {/* Curved banner (decorative) */}
      <path
        d="M292,240 C420,332 760,332 888,240 L916,300 C775,398 405,398 264,300 Z"
        fill="none"
        stroke={neon}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Card shoe */}
      <g
        transform="translate(1058,352) rotate(9)"
        fill="none"
        stroke={neon}
        strokeOpacity="0.3"
        strokeWidth="1.5"
      >
        <rect x="0" y="0" width="78" height="140" rx="4" />
        <rect x="9" y="10" width="60" height="104" rx="3" strokeOpacity="0.2" />
      </g>
    </svg>
  );
}


export function BlackjackTable({ state }: { state: BlackjackState | null }) {
  // Cards scale to whatever vertical space the table gets so nothing is ever
  // clipped or squashed, on any phone height.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const shoeRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(72);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      const byHeight = (h - 104) / 2;
      // Leave room for the shoe on the right edge.
      const byWidth = (w - 72) / 6 / 0.7;
      const cap = w >= 700 ? 142 : 96;
      setCardH(Math.max(44, Math.min(cap, Math.floor(Math.min(byHeight, byWidth)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dealerCards = useMemo(
    () => (state?.cards ?? []).filter((c) => c.owner === "DEALER"),
    [state],
  );
  const playerHands = state?.playerHands ?? [];

  // The shoe re-shuffles between hands.
  const handId = String(state?.hand?.id ?? "idle");

  const dealerTotal = useMemo(() => {
    const ranks = dealerCards.filter((c) => c.faceUp && c.rank).map((c) => c.rank as number);
    const hidden = dealerCards.some((c) => !c.faceUp);
    const v = handValue(ranks);
    return hidden ? `${v.total}+` : formatTotal(v);
  }, [dealerCards]);

  const shoeW = Math.round(cardH * 0.7);

  return (
    <div ref={boxRef} className="relative h-full overflow-hidden bg-[#07130d]">
      <style>{`
@keyframes bj-shuffle{0%{transform:translateX(0) rotate(0deg)}25%{transform:translateX(-5px) rotate(-4deg)}50%{transform:translateX(4px) rotate(3deg)}75%{transform:translateX(-2px) rotate(-1.5deg)}100%{transform:translateX(0) rotate(0deg)}}
`}</style>

      <FeltArt />

      {/* Brand watermark sits below the dealer pill so the two never overlap. */}
      <div className="pointer-events-none absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[var(--color-neon)] opacity-[0.14]">
        <CsseMark variant="mono" className="h-7 w-7 md:h-11 md:w-11" />
        <span className="font-display text-base font-bold tracking-tight md:text-2xl">CSSEBets</span>
      </div>

      {/* Shoe — every card is dealt out of this stack. */}
      <div
        key={handId}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 animate-[bj-shuffle_600ms_ease-in-out] md:right-4"
        style={{ width: shoeW, height: cardH }}
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="absolute inset-0 rounded-[4px] border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)]"
            style={{
              transform: `translate(${i * 1.5}px, ${-i * 1.5}px)`,
              backgroundImage:
                "repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-neon) 22%, transparent) 0 4px, transparent 4px 8px)",
            }}
          />
        ))}
        <div ref={shoeRef} className="absolute inset-0" />
      </div>

      <div className="relative flex h-full flex-col items-stretch gap-1 px-3 pb-2 pr-[calc(var(--bj-shoe,64px)+12px)] pt-3 md:gap-2 md:px-6 md:pb-4 md:pt-5">
        {/* Dealer */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-2">
          <Totals label="Dealer" value={dealerCards.length ? dealerTotal : "—"} />

          <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
            {dealerCards.map((c, i) => (
              <PlayingCard
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                faceUp={c.faceUp}
                index={i}
                height={cardH}
                dealFrom={shoeRef}
              />
            ))}
          </div>
        </div>

        {/* Center spacer — the outcome is shown in the result pop-up. */}
        <div className="h-2 shrink-0" />

        {/* Player */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
          <div className="flex max-w-full flex-wrap items-start justify-center gap-3 md:gap-4">
            {playerHands.map((ph) => {
              const cards = (state?.cards ?? []).filter((c) => c.playerHandId === ph.id);
              const v = handValue(cards.map((c) => (c.rank ?? 0) as number));
              return (
                <div key={ph.id} className="flex flex-col items-center gap-1">
                  <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
                    {cards.map((c, i) => (
                      <PlayingCard
                        key={c.id}
                        rank={c.rank}
                        suit={c.suit}
                        faceUp={c.faceUp}
                        index={i}
                        height={cardH}
                        dealFrom={shoeRef}
                      />
                    ))}
                  </div>
                  <Totals
                    label={playerHands.length > 1 ? `Hand ${ph.hand_index + 1}` : "You"}
                    value={formatTotal(v)}
                    tone={ph.status === "ACTIVE" ? "neon" : "muted"}
                  />
                </div>
              );
            })}
            {!playerHands.length && (
              <div className="flex items-center text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
                No cards yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

