import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* CSSEBets brand identity system                                      */
/*                                                                     */
/* Tokens (kept in one place so every surface stays on-brand):         */
/*   Wordmark font ........ Space Grotesk 600                          */
/*   Letter-spacing ....... -0.02em (tight, premium SaaS feel)         */
/*   Mark ratio ........... 1:1 on a 32-unit grid, 3.25-unit stroke    */
/*   Surface (app icon) .... #0B1220 with 22% radius                   */
/*   Brand green ........... oklch(0.78 0.19 145) — project --primary  */
/* ------------------------------------------------------------------ */

const BRAND_FONT =
  '"Space Grotesk", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const ACCENT = "oklch(0.78 0.19 145)";
const SURFACE = "#0B1220";

type MarkVariant = "default" | "mono" | "inverse";

export interface CsseMarkProps extends React.SVGAttributes<SVGSVGElement> {
  className?: string;
  variant?: MarkVariant;
  title?: string;
  /** Draw a black outline around the green strokes so the mark stays visible on green surfaces. */
  outline?: boolean;
}

/**
 * CSSEBets proprietary glyph.
 * A geometric C-wedge opening right, holding an upward chevron:
 *   • C wedge — “Competitive Strategy Starts Everywhere”
 *   • Inner chevron — prediction, ascent, winning through skill
 *
 * Built on a 32-unit grid with a 3.25-unit stroke so the silhouette
 * stays crisp at 16px favicon size up through 256px hero size.
 */
export function CsseMark({ className, variant = "default", title, ...rest }: CsseMarkProps) {
  const wedgeColor = variant === "inverse" ? SURFACE : "currentColor";
  const accentColor = variant === "mono" ? "currentColor" : ACCENT;

  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      className={cn("inline-block shrink-0", className)}
      {...rest}
    >

      {title ? <title>{title}</title> : null}
      <path
        d="M24 7 L11 7 L4 16 L11 25 L24 25"
        stroke={wedgeColor}
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

/* ---------------------------- Wordmark ----------------------------- */

export interface CsseWordmarkProps {
  className?: string;
  /** Pixel size of the wordmark cap-height. Defaults to 20. */
  size?: number;
  /** Render the "CSSE" half in inverse (dark on light surfaces). */
  inverse?: boolean;
}

/**
 * Custom wordmark: "CSSE" in foreground + "Bets" in brand green.
 * Uses Space Grotesk 600 with tight tracking — same family of
 * geometric sans used by enterprise SaaS brands (Linear, Notion).
 */
export function CsseWordmark({ className, size = 20, inverse = false }: CsseWordmarkProps) {
  return (
    <span
      className={cn("inline-flex items-baseline leading-none select-none", className)}
      style={{
        fontFamily: BRAND_FONT,
        fontWeight: 700,
        fontSize: `${size}px`,
        letterSpacing: "-0.02em",
        fontFeatureSettings: '"ss01", "ss02"',
      }}
      aria-label="CSSEBets"
    >
      <span style={{ color: inverse ? SURFACE : "var(--foreground, #fff)" }}>CSSE</span>
      <span style={{ color: ACCENT }}>Bets</span>
    </span>
  );
}

/**
 * Inline brand name for use INSIDE sentences/captions. Inherits the
 * surrounding font-size (1em) so it always matches the paragraph it sits in.
 * Renders "CSSE" in current text color + "Bets" in brand neon green.
 *
 * Use anywhere you'd otherwise type "CSSEBets" inside JSX copy.
 */
export function BrandText({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-baseline leading-none align-baseline", className)}
      style={{
        fontFamily: BRAND_FONT,
        fontWeight: 700,
        fontSize: "1em",
        letterSpacing: "-0.02em",
        fontFeatureSettings: '"ss01", "ss02"',
        whiteSpace: "nowrap",
      }}
      aria-label="CSSEBets"
    >
      <span style={{ color: "currentColor" }}>CSSE</span>
      <span style={{ color: "var(--color-neon, " + ACCENT + ")" }}>Bets</span>
    </span>
  );
}

/* --------------------------- Lockups ------------------------------- */

export interface CsseLogoProps {
  className?: string;
  /** Cap-height of wordmark in px. Mark scales 1.4× alongside. Default 20. */
  size?: number;
  /** Hide the wordmark and render the mark only. */
  markOnly?: boolean;
  /** Inverse the wordmark for use on light surfaces. */
  inverse?: boolean;
}

/** Primary horizontal lockup: mark + wordmark, baseline-aligned. */
export function CsseLogo({ className, size = 20, markOnly = false, inverse = false }: CsseLogoProps) {
  const markSize = Math.round(size * 1.4);
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CsseMark
        title="CSSEBets"
        className={inverse ? "text-[#0B1220]" : "text-foreground"}
        width={markSize}
        height={markSize}
      />

      {!markOnly ? <CsseWordmark size={size} inverse={inverse} /> : null}
    </span>
  );
}

/**
 * Square app icon: dark surface, rounded corners, centered mark.
 * Sized via the `size` prop (px). Matches the favicon visual.
 */
export function CsseAppIcon({
  size = 64,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      className={cn("rounded-[22%]", className)}
      role="img"
      aria-label="CSSEBets app icon"
    >
      <rect width="32" height="32" rx="7" fill={SURFACE} />
      <path
        d="M24 7 L11 7 L4 16 L11 25 L24 25"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 21 L21 14 L27 21"
        fill="none"
        stroke="#22E08A"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}



