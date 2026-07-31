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
      <span className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span
        className={cn(
          "min-w-9 rounded-full border px-2.5 py-0.5 text-center font-mono text-[12px] font-bold tabular-nums",
          tone === "neon"
            ? "border-[var(--color-neon)]/50 bg-[var(--color-neon)]/10 text-[var(--color-neon)]"
            : "border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]",
        )}
      >
        {value}
      </span>
    </div>
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
      setCardH(Math.max(46, Math.min(104, Math.floor(Math.min(byHeight, byWidth)))));
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
      className="relative h-full overflow-hidden rounded-2xl bg-[radial-gradient(120%_90%_at_50%_0%,color-mix(in_srgb,var(--color-neon)_10%,transparent),transparent_70%),var(--color-surface)]"
    >
      <style>{`@keyframes bj-deal{from{opacity:0;transform:translateY(-18px) scale(.92)}to{opacity:1;transform:none}}`}</style>

      {/* Felt oval */}
      <div className="pointer-events-none absolute left-1/2 top-4 bottom-4 w-[132%] -translate-x-1/2 rounded-[999px] border border-[var(--color-neon)]/15 bg-[radial-gradient(80%_70%_at_50%_20%,color-mix(in_srgb,var(--color-neon)_7%,transparent),transparent_75%)]" />

      {/* Watermark is deliberately low contrast so cards remain the focus. */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 text-[var(--color-neon)] opacity-[0.09]">
        <CsseMark variant="mono" className="h-14 w-14 md:h-20 md:w-20" />
      </div>

      {/* Card shoe */}
      <div className="pointer-events-none absolute right-2 top-1/2 h-[64px] w-[24px] -translate-y-1/2 rotate-[8deg] rounded-[4px] border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] shadow-[0_8px_18px_rgba(0,0,0,.5)] md:right-6 md:h-[112px] md:w-[38px]">
        <div className="absolute inset-[4px] rounded-[3px] border border-[var(--color-neon)]/25" />
        <div className="absolute inset-[9px] rounded-[2px] border border-[var(--color-neon)]/15" />
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

        {/* Center: felt legend or result banner */}
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
          ) : (
            <>
              <FeltBanner text="Blackjack scores 150" />
              <span className="hidden md:block">
                <FeltBanner text="Dealer stands on 17" />
              </span>
            </>
          )}
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
              <div className="flex items-center text-[10px] uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                No cards yet
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Classic felt ribbon used for table rules. */
function FeltBanner({ text }: { text: string }) {
  return (
    <div
      className="px-6 py-1 text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--color-ink-muted)]"
      style={{
        clipPath: "polygon(4% 0, 96% 0, 100% 50%, 96% 100%, 4% 100%, 0 50%)",
        background: "color-mix(in srgb, var(--color-neon) 8%, transparent)",
      }}
    >
      {text}
    </div>
  );
}
