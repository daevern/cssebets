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

export const CARD_SLIDE_MS = 480;
export const CARD_FLIP_MS = 520;

/**
 * CSSEbets card back — white bevel frame around a deep-green panel with a
 * woven diamond lattice and the house mark medallion at the centre.
 */
export function CsseCardBack({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative h-full w-full overflow-hidden rounded-[6px] border border-black/15 bg-[#f4f6f3] p-[7%]",
        className,
      )}
    >
      <div
        className="relative h-full w-full overflow-hidden rounded-[4px]"
        style={{
          background: "#0f3d2c",
        }}
      >
        {/* Diamond lattice weave */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, rgba(255,255,255,.10) 0 1px, transparent 1px 9px)," +
              "repeating-linear-gradient(-45deg, rgba(255,255,255,.10) 0 1px, transparent 1px 9px)",
          }}
        />
        {/* Inner hairline */}
        <div className="absolute inset-[6%] rounded-[3px] border border-white/15" />
        {/* Brand medallion */}
        <div className="absolute inset-0 grid place-items-center">
          <div className="grid aspect-square w-[46%] place-items-center rounded-full border border-white/20 bg-black/25">
            <CsseMark variant="mono" className="h-[62%] w-[62%] text-[#8ff0bd]" />
          </div>
        </div>
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
  /** Offset (px) from the shoe to this card's resting slot. */
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  const [flying, setFlying] = useState(true);

  useLayoutEffect(() => {
    const el = boxRef.current;
    const shoe = dealFrom?.current;
    if (!el) return;
    let dx = 0;
    let dy = -18;
    if (shoe) {
      const a = el.getBoundingClientRect();
      const b = shoe.getBoundingClientRect();
      dx = b.left + b.width / 2 - (a.left + a.width / 2);
      dy = b.top + b.height / 2 - (a.top + a.height / 2);
    }
    // Guard against a bad/zero measurement so the card never just "appears".
    // Only used when no explicit origin was supplied.
    if (!shoe && Math.abs(dx) + Math.abs(dy) < 40) {
      dx = Math.max(160, (boxRef.current?.ownerDocument?.defaultView?.innerWidth ?? 400) * 0.35);
      dy = 0;
    }
    setFrom({ x: dx, y: dy });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hold at the shoe for `dealDelay`, then travel to the slot.
  useEffect(() => {
    if (!from) return;
    const t = window.setTimeout(() => setFlying(false), Math.max(0, dealDelay) + 20);
    return () => window.clearTimeout(t);
  }, [from, dealDelay]);

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

  const travelling = !from || flying;

  return (
    <div
      ref={boxRef}
      className={cn("relative shrink-0 select-none", className)}
      style={{
        height: h,
        width: w,
        zIndex: travelling ? 30 : undefined,
        transform: travelling
          ? `translate(${from?.x ?? 0}px, ${from?.y ?? -18}px) scale(0.96)`
          : "translate(0px, 0px) scale(1)",
        transition: travelling ? "none" : `transform ${CARD_SLIDE_MS}ms ease-out`,
        willChange: "transform",
      }}
    >
      {showFace ? (
        <div
          className={cn(
            "absolute inset-0 flex flex-col justify-between rounded-[6px] border border-black/15 bg-[#f7f7f2] px-1.5 py-1",
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
      ) : (
        <div className="absolute inset-0">
          <CsseCardBack />
        </div>
      )}
    </div>
  );
}
