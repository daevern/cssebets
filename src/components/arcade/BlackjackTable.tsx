import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CARD_FLIP_MS,
  CARD_SLIDE_MS,
  CsseCardBack,
  PlayingCard,
} from "@/components/arcade/PlayingCard";
import { CsseMark } from "@/components/brand/CsseMark";
import { formatTotal, handValue } from "@/lib/arcade/blackjack-math";
import type { BjCard } from "@/lib/arcade/blackjack.functions";

export type BlackjackState = {
  hand: any;
  playerHands: any[];
  cards: BjCard[];
};

/** Gap between consecutive cards leaving the shoe. */
const STEP_MS = 420;

function Totals({ label, value, tone }: { label: string; value: string; tone?: "neon" | "muted" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 items-center text-[9px] font-bold uppercase leading-none tracking-[0.32em] text-[var(--color-ink)]">
        {label}
      </span>
      <span
        className={cn(
          "flex h-7 min-w-11 items-center justify-center rounded-[3px] border px-3 text-center font-mono text-[12px] font-bold leading-none tabular-nums transition-colors",
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

      <path
        d="M62,-40 C62,340 300,520 590,520 C880,520 1118,340 1118,-40"
        fill="none"
        stroke={neon}
        strokeOpacity="0.28"
        strokeWidth="1.5"
      />
      <path
        d="M118,-40 C118,320 320,472 590,472 C860,472 1062,320 1062,-40"
        fill="none"
        stroke={neon}
        strokeOpacity="0.16"
        strokeWidth="1.5"
      />
      <path
        d="M292,240 C420,332 760,332 888,240 L916,300 C775,398 405,398 264,300 Z"
        fill="none"
        stroke={neon}
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type Timing = { deal: number; flip: number };

export function BlackjackTable({
  state,
  onBusyChange,
}: {
  state: BlackjackState | null;
  /** True while cards are still sliding/flipping — used to hold back results. */
  onBusyChange?: (busy: boolean) => void;
}) {
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
      const byWidth = (w - 72) / 6 / 0.7;
      const cap = w >= 700 ? 142 : 96;
      setCardH(Math.max(44, Math.min(cap, Math.floor(Math.min(byHeight, byWidth)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cards = state?.cards ?? [];
  const handId = String(state?.hand?.id ?? "idle");

  /* ------------------------------------------------------------------
   * Deal choreography.
   * New cards leave the shoe one at a time (dealer first, then player,
   * alternating on the opening deal) and only flip once they have landed.
   * A hole card turning over is queued behind everything still in flight.
   * ---------------------------------------------------------------- */
  const seenRef = useRef<Map<string, { faceUp: boolean; timing: Timing }>>(new Map());
  const handRef = useRef(handId);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const timings = useMemo(() => {
    if (handRef.current !== handId) {
      handRef.current = handId;
      seenRef.current = new Map();
    }
    const seen = seenRef.current;

    const fresh = cards.filter((c) => !seen.has(c.id));
    const turned = cards.filter((c) => seen.has(c.id) && c.faceUp && !seen.get(c.id)!.faceUp);

    // Opening deal: dealer card, player card, dealer card, player card.
    const ordered = [...fresh].sort((a, b) => {
      const pa = Math.floor(fresh.filter((c) => c.owner === a.owner && c.sequence < a.sequence).length);
      const pb = Math.floor(fresh.filter((c) => c.owner === b.owner && c.sequence < b.sequence).length);
      if (fresh.length >= 4) {
        if (pa !== pb) return pa - pb;
        if (a.owner !== b.owner) return a.owner === "DEALER" ? -1 : 1;
      }
      return a.sequence - b.sequence;
    });

    let cursor = 0;
    const out = new Map<string, Timing>();
    for (const c of ordered) {
      const deal = cursor;
      const flip = deal + CARD_SLIDE_MS + 90;
      out.set(c.id, { deal, flip });
      cursor += STEP_MS;
    }
    // Hole card / dealer draw reveals come after the fresh cards have landed.
    let revealCursor = ordered.length ? cursor + 120 : 0;
    for (const c of turned.sort((a, b) => a.sequence - b.sequence)) {
      out.set(c.id, { deal: 0, flip: revealCursor });
      revealCursor += CARD_FLIP_MS + 80;
    }

    for (const c of cards) {
      const t = out.get(c.id) ?? seen.get(c.id)?.timing ?? { deal: 0, flip: 0 };
      seen.set(c.id, { faceUp: c.faceUp, timing: t });
      out.set(c.id, out.get(c.id) ?? { deal: 0, flip: 0 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, handId]);

  // Busy window + progressive reveal so totals never spoil a flip.
  useEffect(() => {
    const timers: number[] = [];
    let last = 0;
    for (const c of cards) {
      const t = timings.get(c.id) ?? { deal: 0, flip: 0 };
      const done = (c.faceUp ? t.flip + CARD_FLIP_MS : t.deal + CARD_SLIDE_MS) + 40;
      last = Math.max(last, done);
      if (c.faceUp && !revealed.has(c.id)) {
        timers.push(
          window.setTimeout(() => {
            setRevealed((s) => (s.has(c.id) ? s : new Set(s).add(c.id)));
          }, Math.max(0, t.flip + CARD_FLIP_MS * 0.55)),
        );
      }
    }
    if (last > 0) {
      onBusyChange?.(true);
      timers.push(window.setTimeout(() => onBusyChange?.(false), last));
    } else {
      onBusyChange?.(false);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timings]);

  useEffect(() => {
    setRevealed(new Set());
  }, [handId]);

  const dealerCards = useMemo(() => cards.filter((c) => c.owner === "DEALER"), [cards]);
  const playerHands = state?.playerHands ?? [];

  const isShown = (c: BjCard) => c.faceUp && revealed.has(c.id);

  const dealerTotal = useMemo(() => {
    const shown = dealerCards.filter(isShown);
    const ranks = shown.map((c) => c.rank as number).filter((r) => r != null);
    if (!ranks.length) return "—";
    const hidden = dealerCards.length > shown.length;
    const v = handValue(ranks);
    return hidden ? `${v.total}+` : formatTotal(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerCards, revealed]);

  const shoeW = Math.round(cardH * 0.7);

  return (
    <div ref={boxRef} className="relative h-full overflow-hidden bg-[#07130d]">
      <FeltArt />

      {/* Brand watermark sits below the dealer pill so the two never overlap. */}
      <div className="pointer-events-none absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[var(--color-neon)] opacity-[0.14]">
        <CsseMark variant="mono" className="h-7 w-7 md:h-11 md:w-11" />
        <span className="font-display text-base font-bold tracking-tight md:text-2xl">CSSEBets</span>
      </div>

      {/* Shoe — every card is dealt out of this stack. */}
      <div
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 md:right-4"
        style={{ width: shoeW, height: cardH }}
      >
        {[3, 2, 1, 0].map((i) => (
          <div
            key={i}
            className="absolute inset-0"
            style={{ transform: `translate(${i * 1.8}px, ${-i * 1.8}px)` }}
          >
            <CsseCardBack className={i ? "opacity-80" : undefined} />
          </div>
        ))}
        <div ref={shoeRef} className="absolute inset-0" />
      </div>

      <div className="relative flex h-full flex-col items-stretch gap-1 px-3 pb-2 pr-16 md:pr-24 pt-3 md:gap-2 md:px-6 md:pb-4 md:pt-5">
        {/* Dealer */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-start gap-2">
          <Totals label="Dealer" value={dealerCards.length ? dealerTotal : "—"} />

          <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
            {dealerCards.map((c) => (
              <PlayingCard
                key={c.id}
                rank={c.rank}
                suit={c.suit}
                faceUp={c.faceUp}
                dealDelay={timings.get(c.id)?.deal ?? 0}
                flipDelay={timings.get(c.id)?.flip ?? 0}
                height={cardH}
                dealFrom={shoeRef}
              />
            ))}
          </div>
        </div>

        <div className="h-2 shrink-0" />

        {/* Player */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
          <div className="flex max-w-full flex-wrap items-start justify-center gap-3 md:gap-4">
            {playerHands.map((ph) => {
              const handCards = cards.filter((c) => c.playerHandId === ph.id);
              const shownRanks = handCards
                .filter(isShown)
                .map((c) => (c.rank ?? 0) as number);
              const v = handValue(shownRanks);
              return (
                <div key={ph.id} className="flex flex-col items-center gap-1">
                  <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
                    {handCards.map((c) => (
                      <PlayingCard
                        key={c.id}
                        rank={c.rank}
                        suit={c.suit}
                        faceUp={c.faceUp}
                        dealDelay={timings.get(c.id)?.deal ?? 0}
                        flipDelay={timings.get(c.id)?.flip ?? 0}
                        height={cardH}
                        dealFrom={shoeRef}
                      />
                    ))}
                  </div>
                  <Totals
                    label={playerHands.length > 1 ? `Hand ${ph.hand_index + 1}` : "You"}
                    value={shownRanks.length ? formatTotal(v) : "—"}
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
