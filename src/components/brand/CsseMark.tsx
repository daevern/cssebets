import { cn } from "@/lib/utils";

type Variant = "default" | "mono" | "inverse";

interface CsseMarkProps {
  className?: string;
  variant?: Variant;
  title?: string;
}

/**
 * CSSEBets proprietary brand mark.
 *
 * A geometric "C" wedge opening right, holding an upward chevron — a custom
 * signature for "Competitive Strategy Starts Everywhere": prediction, ascent,
 * and winning through skill. Scales cleanly from favicon (16px) to hero (256px+).
 *
 * Built with crisp 2px geometry on a 32×32 grid so the silhouette stays sharp
 * at small sizes. Dark-mode optimized: white outer wedge + electric green
 * accent (project primary token).
 */
export function CsseMark({ className, variant = "default", title }: CsseMarkProps) {
  const wedgeColor = variant === "inverse" ? "hsl(var(--primary-foreground))" : "currentColor";
  const accentColor =
    variant === "mono" ? "currentColor" : "oklch(0.78 0.19 145)"; // pitch / electric green

  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("inline-block", className)}
    >
      {title ? <title>{title}</title> : null}
      {/* Outer C-wedge — three thick segments forming a bracket opening right */}
      <path
        d="M24 7 L11 7 L4 16 L11 25 L24 25"
        stroke={wedgeColor}
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner ascent chevron — strategy & prediction rising */}
      <path
        d="M15 21 L21 14 L27 21"
        stroke={accentColor}
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Lockup: mark + wordmark, for headers & auth screens. */
export function CsseLogo({
  className,
  markClassName,
  showWordmark = true,
}: {
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CsseMark className={cn("h-7 w-7 text-foreground", markClassName)} title="CSSEBets" />
      {showWordmark ? (
        <span className="text-lg font-semibold tracking-tight text-foreground">
          CSSE<span className="text-primary">Bets</span>
        </span>
      ) : null}
    </span>
  );
}
