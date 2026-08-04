import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { isRedSuit, rankLabel, suitSymbol } from "@/lib/arcade/blackjack-math";
import { CsseMark } from "@/components/brand/CsseMark";

type Props = {
  rank: number | null;
  suit: number | null;
  faceUp: boolean;
  className?: string;
  /** Explicit card height in px; width is derived at a 0.7 ratio. */
  height?: number;
  /** The shoe/deck the card should appear to slide out of. */
  dealFrom?: React.RefObject<HTMLElement | null>;
  /** ms before this card slides out of the shoe. */
  dealDelay?: number;
  /** ms before this card flips face-up (absolute, from mount/reveal). */
  flipDelay?: number;
};

export const CARD_SLIDE_MS = 360;
export const CARD_FLIP_MS = 520;

/** The shared CSSEbets card back — identical to the Rock–Paper–Scissors deck. */
export function CsseCardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-full w-full rounded-[4px] border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)]",
        className,
      )}
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, color-mix(in srgb, var(--color-neon) 22%, transparent) 0 4px, transparent 4px 8px)",
      }}
    >
      <div className="absolute inset-[5px] rounded-[2px] border border-[var(--color-neon)]/30" />
      <div className="absolute inset-0 grid place-items-center text-[var(--color-neon)]">
        <CsseMark variant="mono" className="h-[42%] w-[42%]" />
      </div>
    </div>
  );
}

export function PlayingCard({
  rank,
  suit,
  faceUp,
  className,
  height,
  dealFrom,
  dealDelay = 0,
  flipDelay,
}: Props) {
  const red = suit != null && isRedSuit(suit);
  const h = height ?? 72;
  const w = Math.round(h * 0.7);
  const corner = Math.max(9, Math.round(h * 0.17));
  const pip = Math.max(14, Math.round(h * 0.3));

  const boxRef = useRef<HTMLDivElement | null>(null);
  /** Every card lands face-down first, then flips — never a straight reveal. */
  const [landed, setLanded] = useState(false);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const shoe = dealFrom?.current;
    if (!el) return;
    let from = "translate(0px, -14px)";
    if (shoe) {
      const a = el.getBoundingClientRect();
      const b = shoe.getBoundingClientRect();
      from = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${
        b.top + b.height / 2 - (a.top + a.height / 2)
      }px) rotate(-12deg)`;
    }
    el.animate(
      [
        { transform: from, opacity: 0.9 },
        { transform: "translate(0,0) rotate(0deg)", opacity: 1 },
      ],
      {
        duration: CARD_SLIDE_MS,
        delay: dealDelay,
        easing: "cubic-bezier(.2,.7,.3,1)",
        fill: "backwards",
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!faceUp) {
      setLanded(false);
      return;
    }
    const wait = flipDelay ?? dealDelay + CARD_SLIDE_MS + 80;
    const t = window.setTimeout(() => setLanded(true), Math.max(0, wait));
    return () => window.clearTimeout(t);
  }, [faceUp, flipDelay, dealDelay]);

  const showFace = faceUp && landed;

  return (
    <div
      ref={boxRef}
      className={cn("relative shrink-0 select-none [perspective:900px]", className)}
      style={{ height: h, width: w }}
    >
      <div
        className="relative h-full w-full [transform-style:preserve-3d]"
        style={{
          transform: showFace ? "rotateY(0deg)" : "rotateY(180deg)",
          transition: `transform ${CARD_FLIP_MS}ms cubic-bezier(.2,.8,.25,1)`,
        }}
      >
        {/* Face */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-between rounded-[4px] border border-black/10 bg-[#f7f7f2] px-1.5 py-1 [backface-visibility:hidden]",
            red ? "text-[#d92b3a]" : "text-[#101418]",
          )}
        >
          <span className="font-black leading-none" style={{ fontSize: corner }}>
            {rank ? rankLabel(rank) : ""}
          </span>
          <span className="self-center leading-none" style={{ fontSize: pip }}>
            {suit != null ? suitSymbol(suit) : ""}
          </span>
          <span className="self-end rotate-180 font-black leading-none" style={{ fontSize: corner }}>
            {rank ? rankLabel(rank) : ""}
          </span>
        </div>

        {/* Back */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <CsseCardBack />
        </div>
      </div>
    </div>
  );
}
