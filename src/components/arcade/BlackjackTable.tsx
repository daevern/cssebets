import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  CARD_FLIP_MS,
  CARD_SLIDE_MS,
  CsseCardBack,
  PlayingCard,
} from "@/components/arcade/PlayingCard";
import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
import { ARCADE_THEMES } from "@/lib/arcade/theme";
import { formatTotal, handValue } from "@/lib/arcade/blackjack-math";
import type { BjCard } from "@/lib/arcade/blackjack.functions";

export type BlackjackState = {
  hand: any;
  playerHands: any[];
  cards: BjCard[];
};

/** Gap between consecutive cards leaving the shoe. */
const STEP_MS = 420;

const T = ARCADE_THEMES.blackjack;
const LOSS = "#ff4d5e";

/** Slate-console read-out, matching Dice / Hi-Lo stat cells. */
function Totals({ label, value, tone }: { label: string; value: string; tone?: "neon" | "muted" }) {
  return (
    <div
      className="flex items-center gap-2 rounded-[6px] border px-2.5 py-1.5"
      style={{
        background: "#0f212e",
        borderColor: tone === "neon" ? T.accent : "rgba(255,255,255,.08)",
        boxShadow: tone === "neon" ? `0 0 10px ${T.accent}33` : "none",
      }}
    >
      <span className="text-[9px] font-bold uppercase leading-none tracking-[0.16em] text-white/40">
        {label}
      </span>
      <span
        className={cn(
          "font-display text-[15px] font-black leading-none tabular-nums transition-colors",
        )}
        style={{ color: tone === "neon" ? T.accent : "#ffffff" }}
      >
        {value}
      </span>
    </div>
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
      const byHeight = (h - 160) / 2;
      const byWidth = (w - 72) / 6 / 0.7;
      const cap = w >= 700 ? 142 : 96;
      setCardH(Math.max(44, Math.min(cap, Math.floor(Math.min(byHeight, byWidth)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cards = useMemo(() => state?.cards ?? [], [state]);
  const handId = String(state?.hand?.id ?? "idle");

  /* ------------------------------------------------------------------
   * Deal choreography.
   * New cards leave the shoe one at a time (dealer first, then player,
   * alternating on the opening deal) and only flip once they have landed.
   * A hole card turning over is queued behind everything still in flight.
   * ---------------------------------------------------------------- */
  const seenRef = useRef<{ handId: string; cards: Map<string, boolean>; timings: Map<string, Timing> }>({
    handId,
    cards: new Map(),
    timings: new Map(),
  });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  const plan = useMemo(() => {
    const prev = seenRef.current;
    const sameHand = prev.handId === handId;
    const seen = sameHand ? prev.cards : new Map<string, boolean>();
    const prevTimings = sameHand ? prev.timings : new Map<string, Timing>();

    const fresh = cards.filter((c) => !seen.has(c.id));
    const turned = cards.filter((c) => seen.has(c.id) && c.faceUp && seen.get(c.id) === false);

    // Opening deal: dealer card, player card, dealer card, player card.
    const pairIndex = (c: BjCard) =>
      fresh.filter((o) => o.owner === c.owner && o.sequence < c.sequence).length;
    const ordered = [...fresh].sort((a, b) => {
      if (fresh.length >= 4) {
        const pa = pairIndex(a);
        const pb = pairIndex(b);
        if (pa !== pb) return pa - pb;
        if (a.owner !== b.owner) return a.owner === "DEALER" ? -1 : 1;
      }
      return a.sequence - b.sequence;
    });

    const timings = new Map<string, Timing>();
    let cursor = 0;
    let animEnd = 0;
    for (const c of ordered) {
      const deal = cursor;
      const flip = deal + CARD_SLIDE_MS + 90;
      timings.set(c.id, { deal, flip });
      animEnd = Math.max(animEnd, c.faceUp ? flip + CARD_FLIP_MS : deal + CARD_SLIDE_MS);
      cursor += STEP_MS;
    }
    // Hole card / dealer draws turn over after everything has landed.
    let revealCursor = ordered.length ? cursor + 160 : 0;
    for (const c of [...turned].sort((a, b) => a.sequence - b.sequence)) {
      timings.set(c.id, { deal: 0, flip: revealCursor });
      animEnd = Math.max(animEnd, revealCursor + CARD_FLIP_MS);
      revealCursor += CARD_FLIP_MS + 120;
    }
    for (const c of cards) {
      if (!timings.has(c.id)) timings.set(c.id, prevTimings.get(c.id) ?? { deal: 0, flip: 0 });
    }
    return { timings, animEnd, fresh: new Set([...ordered, ...turned].map((c) => c.id)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, handId]);

  const timings = plan.timings;

  // Commit what we have seen, then stagger the reveal so totals never spoil a flip.
  useEffect(() => {
    seenRef.current = {
      handId,
      cards: new Map(cards.map((c) => [c.id, c.faceUp])),
      timings: plan.timings,
    };

    const timers: number[] = [];
    for (const c of cards) {
      if (!c.faceUp || revealed.has(c.id)) continue;
      const t = plan.timings.get(c.id) ?? { deal: 0, flip: 0 };
      const at = plan.fresh.has(c.id) ? t.flip + CARD_FLIP_MS * 0.55 : 0;
      timers.push(
        window.setTimeout(() => {
          setRevealed((s) => (s.has(c.id) ? s : new Set(s).add(c.id)));
        }, Math.max(0, at)),
      );
    }
    if (plan.animEnd > 0) {
      onBusyChange?.(true);
      timers.push(window.setTimeout(() => onBusyChange?.(false), plan.animEnd + 80));
    } else {
      onBusyChange?.(false);
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);



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
    <div
      ref={boxRef}
      className="relative mx-auto h-full w-full max-w-[560px] overflow-hidden rounded-[10px]"
      style={{ background: T.feltOrBoardFill }}
    >
      {/* House medallion — quiet slate watermark, always dead centre. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 opacity-70">
        <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 md:h-14 md:w-14">
          <CsseMark variant="mono" className="h-6 w-6 text-white/15 md:h-8 md:w-8" />
        </div>
        <CsseWordmark
          size={12}
          className="[&_span]:[color:transparent!important] [&_span]:[-webkit-text-stroke:0.7px_rgba(255,255,255,0.18)!important]"
        />
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

      <div className="relative mx-auto flex h-full w-full max-w-3xl flex-col items-stretch gap-1 px-10 pb-3 pt-3 md:gap-2 md:px-16 md:pb-4 md:pt-4">
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

        {/* Reserved centre lane for the house medallion. */}
        <div className="relative h-16 shrink-0 md:h-20">
          {!cards.length && (
            <div className="pointer-events-none absolute inset-x-0 -bottom-24 flex flex-col items-center gap-2 md:-bottom-28">
              <div
                className="rounded-full border px-4 py-1"
                style={{
                  borderColor: "rgba(224,182,74,.35)",
                  background: "rgba(0,0,0,.28)",
                  boxShadow: "inset 0 0 0 1px rgba(212,176,90,.45)",
                }}
              >
                <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[#f0e3bd]/80">
                  Place a bet to deal
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Player */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-end gap-1">
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

          </div>
        </div>
      </div>
    </div>
  );
}
