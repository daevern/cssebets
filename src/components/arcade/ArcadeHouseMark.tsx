import { CsseMark, CsseWordmark } from "@/components/brand/CsseMark";
import { cn } from "@/lib/utils";

/**
 * Quiet centre-felt house watermark shared by table boards.
 * Presentation only — matches Blackjack's medallion, not a second brand.
 */
export function ArcadeHouseMark({
  className,
  opacity = 0.7,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute left-1/2 top-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5",
        className,
      )}
      style={{ opacity }}
    >
      <div className="grid h-11 w-11 place-items-center rounded-full border border-white/10 md:h-14 md:w-14">
        <CsseMark variant="mono" className="h-6 w-6 text-white/15 md:h-8 md:w-8" />
      </div>
      <CsseWordmark
        size={12}
        className="[&_span]:[color:transparent!important] [&_span]:[-webkit-text-stroke:0.7px_rgba(255,255,255,0.18)!important]"
      />
    </div>
  );
}
