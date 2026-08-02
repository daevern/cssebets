import { cn } from "@/lib/utils";
import { isRedSuit, rankLabel, suitSymbol } from "@/lib/arcade/blackjack-math";
import { CsseMark } from "@/components/brand/CsseMark";

type Props = {
  rank: number | null;
  suit: number | null;
  faceUp: boolean;
  /** Deal index — used to stagger the entry animation. */
  index?: number;
  className?: string;
  /** Explicit card height in px; width is derived at a 0.7 ratio. */
  height?: number;
};

export function PlayingCard({ rank, suit, faceUp, index = 0, className, height }: Props) {
  const red = suit != null && isRedSuit(suit);
  const h = height ?? 72;
  const w = Math.round(h * 0.7);
  const corner = Math.max(9, Math.round(h * 0.17));
  const pip = Math.max(14, Math.round(h * 0.3));
  return (
    <div
      className={cn("relative shrink-0 select-none [perspective:800px]", className)}
      style={{
        height: h,
        width: w,
        animation: `bj-deal 280ms ease-out ${index * 90}ms both`,
      }}
    >
      <div
        className="relative h-full w-full transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: faceUp ? "rotateY(0deg)" : "rotateY(180deg)" }}
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
        <div
          className="absolute inset-0 rounded-[4px] border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)] [backface-visibility:hidden] [transform:rotateY(180deg)]"
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
      </div>
    </div>
  );
}
