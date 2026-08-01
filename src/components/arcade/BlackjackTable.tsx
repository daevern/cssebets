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

const RESULT_COPY: Record<string, string> = {
  BLACKJACK: "Blackjack!",
  WIN: "You win",
  PUSH: "Push",
  LOSS: "Dealer wins",
  BUST: "Bust",
  MIXED: "Split result",
  VOID: "Void",
  REVERSED: "Reversed",
};

function Totals({ label, value, tone }: { label: string; value: string; tone?: "neon" | "muted" }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink)]">
        {label}
      </span>
      <span
        className={cn(
          "min-w-10 rounded-full border px-3 py-1 text-center font-mono text-[12px] font-bold tabular-nums",
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
      viewBox="0 0 1180 600"
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
        strokeOpacity="0.5"
        strokeWidth="2.5"
      />
      {/* Inner arc */}
      <path
        d="M118,-40 C118,320 320,472 590,472 C860,472 1062,320 1062,-40"
        fill="none"
        stroke={neon}
        strokeOpacity="0.28"
        strokeWidth="2"
      />

      {/* Curved rule banner */}
      <path
        d="M292,240 C420,332 760,332 888,240 L916,300 C775,398 405,398 264,300 Z"
        fill="none"
        stroke={neon}
        strokeOpacity="0.75"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <text
        fill={neon}
        fontSize="46"
        fontWeight="700"
        letterSpacing="4"
        style={{ fontFamily: "var(--font-display, inherit)" }}
      >
        <textPath href="#bj-arc-banner" startOffset="50%" textAnchor="middle">
          BLACKJACK PAYS 3 TO 2
        </textPath>
      </text>

      {/* Side rules */}
      <text fill={neon} fillOpacity="0.45" fontSize="27" fontWeight="700" letterSpacing="3">
        <textPath href="#bj-arc-left" startOffset="42%" textAnchor="middle">
          DEALER HITS SOFT 17
        </textPath>
      </text>
      <text fill={neon} fillOpacity="0.45" fontSize="27" fontWeight="700" letterSpacing="3">
        <textPath href="#bj-arc-right" startOffset="58%" textAnchor="middle">
          INSURANCE PAYS 2 TO 1
        </textPath>
      </text>

      {/* Card shoe */}
      <g
        transform="translate(1058,352) rotate(9)"
        fill="none"
        stroke={neon}
        strokeOpacity="0.55"
        strokeWidth="2.5"
      >
        <rect x="0" y="0" width="78" height="140" rx="12" />
        <rect x="9" y="10" width="60" height="104" rx="8" strokeOpacity="0.35" />
      </g>
    </svg>
  );
}


export function BlackjackTable({ state }: { state: BlackjackState | null }) {
  // Cards scale to whatever vertical space the table gets so nothing is ever
  // clipped or squashed, on any phone height.
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [cardH, setCardH] = useState(72);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      const byHeight = (h - 96) / 2;
      const byWidth = w / 6 / 0.7;
      const cap = w >= 700 ? 150 : 104;
      setCardH(Math.max(46, Math.min(cap, Math.floor(Math.min(byHeight, byWidth)))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dealerCards = useMemo(
    () => (state?.cards ?? []).filter((c) => c.owner === "DEALER"),
    [state],
  );
  const playerHands = state?.playerHands ?? [];

  const dealerTotal = useMemo(() => {
    const ranks = dealerCards.filter((c) => c.faceUp && c.rank).map((c) => c.rank as number);
    const hidden = dealerCards.some((c) => !c.faceUp);
    const v = handValue(ranks);
    return hidden ? `${v.total}+` : formatTotal(v);
  }, [dealerCards]);

  const result = state?.hand?.result as string | undefined;
  const settled = state?.hand?.status === "COMPLETED";

  return (
    <div
      ref={boxRef}
      className="relative h-full overflow-hidden bg-[radial-gradient(130%_105%_at_50%_-5%,color-mix(in_srgb,var(--color-neon)_14%,#04120b),#04120b_62%,#020a06)]"
    >
      <style>{`@keyframes bj-deal{from{opacity:0;transform:translateY(-18px) scale(.92)}to{opacity:1;transform:none}}`}</style>

      <FeltArt />

      {/* Brand watermark replaces the plain wordmark in the reference felt. */}
      <div className="pointer-events-none absolute left-1/2 top-[26%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[var(--color-neon)] opacity-[0.16]">
        <CsseMark variant="mono" className="h-8 w-8 md:h-12 md:w-12" />
        <span className="font-display text-lg font-bold tracking-tight md:text-3xl">CSSEBets</span>
      </div>


      <div className="relative flex h-full flex-col items-stretch gap-1 px-3 py-2 md:gap-2 md:px-6 md:py-4">
        {/* Dealer */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
          <Totals label="Dealer" value={dealerCards.length ? dealerTotal : "—"} />
          <div className="flex max-w-full flex-wrap items-center justify-center gap-1.5 md:gap-2">
            {dealerCards.map((c, i) => (
              <PlayingCard key={c.id} rank={c.rank} suit={c.suit} faceUp={c.faceUp} index={i} height={cardH} />
            ))}
          </div>
        </div>

        {/* Center: result banner (felt rules live in the art layer) */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-1">
          {settled && result ? (
            <div
              className={cn(
                "rounded-full border px-4 py-1 text-[10px] font-bold uppercase tracking-[0.28em]",
                result === "LOSS" || result === "BUST"
                  ? "border-red-500/40 bg-red-500/10 text-red-300"
                  : result === "PUSH"
                    ? "border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]"
                    : "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 text-[var(--color-neon)]",
              )}
            >
              {RESULT_COPY[result] ?? result}
            </div>
          ) : null}
        </div>


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

