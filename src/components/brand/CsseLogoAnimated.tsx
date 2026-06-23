import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* CsseLogoAnimated                                                    */
/*                                                                     */
/* Bespoke morph animation engineered for the CSSEBets identity:       */
/*                                                                     */
/*   PHASE 1 — Collapse                                                */
/*     • "SSE" letters slide right and fade into the "C"               */
/*     • "ets" letters slide left and fade into the "B"                */
/*                                                                     */
/*   PHASE 2 — Morph                                                   */
/*     • The lone "C" scales up and morphs into the C-wedge mark       */
/*       (white open-right wedge on the 32-unit brand grid)            */
/*     • The lone "B" rotates -90° counter-clockwise so its curves     */
/*       face upward, becomes a "half-B" silhouette, and resolves      */
/*       into the inner ^ chevron (green)                              */
/*                                                                     */
/*   PHASE 3 — Settle                                                  */
/*     • The chevron drops half a beat into the wedge ("about to       */
/*       fall" tension), then locks in place                           */
/*                                                                     */
/* Reused as nav lockup AND (via `loop`) as the loading page mark.     */
/* ------------------------------------------------------------------ */

const BRAND_FONT =
  '"Space Grotesk", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const ACCENT = "oklch(0.78 0.19 145)";

const WEDGE_PATH = "M24 7 L11 7 L4 16 L11 25 L24 25";
const CHEVRON_PATH = "M15 21 L21 14 L27 21";
const WEDGE_LEN = 52;
const CHEVRON_LEN = 18;

export interface CsseLogoAnimatedProps {
  /** Mark size in px. Wordmark cap-height auto-derives. */
  size?: number;
  /** Loop the full sequence — use for loaders. */
  loop?: boolean;
  /** Delay before sequence starts (s). */
  delay?: number;
  /** Total duration (s). Default 2.4s. */
  duration?: number;
  /** Force inverse (dark) colors on the wedge. */
  inverse?: boolean;
  className?: string;
  title?: string;
}

export function CsseLogoAnimated({
  size = 40,
  loop = false,
  delay = 0,
  duration = 2.4,
  inverse = false,
  className,
  title = "CSSEBets",
}: CsseLogoAnimatedProps) {
  const reduce = useReducedMotion();

  const wedgeColor = inverse ? "#0B1220" : "var(--color-ink, #ffffff)";
  const accentColor = ACCENT;

  // Wordmark sizing tuned so the standalone C / B characters land at
  // roughly the same optical weight as the mark glyphs they morph into.
  const cap = Math.round(size * 0.95);
  // Generous track so SSE / ets have room to slide before collapsing.
  const trackWidth = Math.round(size * 4.6);

  const repeat = loop ? { repeat: Infinity, repeatDelay: 0.7 } : {};

  /* ---------- Reduced-motion fallback ---------- */
  if (reduce) {
    return (
      <span
        className={cn("inline-flex items-center gap-2", className)}
        style={{ height: size }}
        aria-label={title}
      >
        <svg viewBox="0 0 32 32" width={size} height={size} fill="none" aria-hidden>
          <path d={WEDGE_PATH} stroke={wedgeColor} strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
          <path d={CHEVRON_PATH} stroke={accentColor} strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span
          style={{
            fontFamily: BRAND_FONT,
            fontWeight: 700,
            fontSize: Math.round(size * 0.72),
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          <span style={{ color: wedgeColor }}>CSSE</span>
          <span style={{ color: accentColor }}>Bets</span>
        </span>
      </span>
    );
  }

  /* ---------- Timing fractions of `duration` ----------
     0.00 – 0.30  Phase 1: SSE/ets collapse into C and B
     0.30 – 0.65  Phase 2: C scales into wedge; B rotates -90° into chevron
     0.65 – 0.85  Phase 3: chevron settles (the "about to fall" beat)
     0.85 – 1.00  Hold
  ---------------------------------------------------- */

  // Common base transition for letter/morph elements.
  const baseTrans = {
    duration,
    delay,
    ease: [0.65, 0, 0.35, 1] as const,
    ...repeat,
  };

  return (
    <span
      className={cn("relative inline-flex items-center select-none", className)}
      style={{ height: size * 1.2, width: trackWidth }}
      aria-label={title}
      role="img"
    >
      {/* ============================================================
          LEFT HALF — "CSSE"  →  C  →  white C-wedge mark
          ============================================================ */}
      <span
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: 0,
          width: trackWidth / 2,
          height: size,
          fontFamily: BRAND_FONT,
          fontWeight: 700,
          fontSize: cap,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        <span className="relative block h-full w-full">
          {/* Anchor "C" — stays in place, eats the SSE letters, then morphs */}
          <motion.span
            className="absolute left-0 top-1/2"
            style={{ color: wedgeColor, transformOrigin: "left center" }}
            initial={{ x: 0, y: "-50%", scale: 1, opacity: 1 }}
            animate={{
              // hold, then scale up as it morphs into the mark
              scale: [1, 1, 1.05, 1.18, 1.18, 1.18],
              opacity: [1, 1, 1, 0, 0, 0],
            }}
            transition={{
              ...baseTrans,
              times: [0, 0.28, 0.34, 0.5, 0.85, 1],
            }}
          >
            C
          </motion.span>

          {/* "SSE" — slides right & collapses into the C */}
          <motion.span
            className="absolute top-1/2 inline-flex"
            style={{
              color: wedgeColor,
              left: cap * 0.62, // sits right after the C
              transformOrigin: "left center",
            }}
            initial={{ x: 0, y: "-50%", scaleX: 1, opacity: 1, letterSpacing: "-0.02em" }}
            animate={{
              x: [0, -cap * 0.55, -cap * 0.62, -cap * 0.62, -cap * 0.62, -cap * 0.62],
              scaleX: [1, 0.18, 0.02, 0.02, 0.02, 0.02],
              opacity: [1, 0.6, 0, 0, 0, 0],
              letterSpacing: ["-0.02em", "-0.16em", "-0.22em", "-0.22em", "-0.22em", "-0.22em"],
            }}
            transition={{
              ...baseTrans,
              times: [0, 0.18, 0.3, 0.5, 0.85, 1],
            }}
          >
            SSE
          </motion.span>

          {/* The morph target — white C-wedge mark, draws on as C fades */}
          <motion.svg
            viewBox="0 0 32 32"
            width={size}
            height={size}
            fill="none"
            className="absolute left-0 top-1/2"
            style={{ y: "-50%" }}
            aria-hidden
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{
              opacity: [0, 0, 0, 1, 1, 1],
              scale: [0.6, 0.6, 0.8, 1, 1, 1],
            }}
            transition={{
              ...baseTrans,
              times: [0, 0.34, 0.42, 0.55, 0.85, 1],
            }}
          >
            <motion.path
              d={WEDGE_PATH}
              stroke={wedgeColor}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={WEDGE_LEN}
              initial={{ strokeDashoffset: WEDGE_LEN }}
              animate={{ strokeDashoffset: [WEDGE_LEN, WEDGE_LEN, WEDGE_LEN, 0, 0, 0] }}
              transition={{
                ...baseTrans,
                times: [0, 0.34, 0.42, 0.62, 0.85, 1],
              }}
            />
          </motion.svg>
        </span>
      </span>

      {/* ============================================================
          RIGHT HALF — "Bets"  →  B (rotated -90°)  →  green chevron
          ============================================================ */}
      <motion.span
        className="absolute top-1/2 -translate-y-1/2"
        style={{
          left: trackWidth / 2 - cap * 0.05,
          width: trackWidth / 2,
          height: size,
          fontFamily: BRAND_FONT,
          fontWeight: 700,
          fontSize: cap,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
        animate={{
          x: [0, 0, -(trackWidth / 2 - cap * 0.05)],
        }}
        transition={{
          ...baseTrans,
          times: [0, 0.3, 0.65],
        }}
      >
        <span className="relative block h-full w-full">
          {/* Anchor "B" — holds, then rotates -90° counter-clockwise so its
              curves face upward, becoming the silhouette of the chevron. */}
          <motion.span
            className="absolute left-0 top-1/2 inline-block"
            style={{
              color: accentColor,
              transformOrigin: "center center",
            }}
            initial={{ x: 0, y: "-50%", rotate: 0, scale: 1, opacity: 1 }}
            animate={{
              rotate: [0, 0, -45, -90, -90, -90],
              // squash vertically to flatten into the chevron silhouette
              scaleY: [1, 1, 0.85, 0.55, 0.55, 0.55],
              scaleX: [1, 1, 1.05, 1.15, 1.15, 1.15],
              opacity: [1, 1, 1, 0.35, 0, 0],
            }}
            transition={{
              ...baseTrans,
              times: [0, 0.28, 0.42, 0.55, 0.7, 1],
            }}
          >
            B
          </motion.span>

          {/* "ets" — slides left & collapses into the B */}
          <motion.span
            className="absolute top-1/2 inline-flex"
            style={{
              color: accentColor,
              left: cap * 0.62,
              transformOrigin: "left center",
            }}
            initial={{ x: 0, y: "-50%", scaleX: 1, opacity: 1, letterSpacing: "-0.02em" }}
            animate={{
              x: [0, -cap * 0.55, -cap * 0.62, -cap * 0.62, -cap * 0.62, -cap * 0.62],
              scaleX: [1, 0.18, 0.02, 0.02, 0.02, 0.02],
              opacity: [1, 0.6, 0, 0, 0, 0],
              letterSpacing: ["-0.02em", "-0.16em", "-0.22em", "-0.22em", "-0.22em", "-0.22em"],
            }}
            transition={{
              ...baseTrans,
              times: [0, 0.18, 0.3, 0.5, 0.85, 1],
            }}
          >
            ets
          </motion.span>

          {/* Morph target — green chevron, drawn on once the B has rotated.
              Starts slightly above its final position so it visually
              "falls" into the wedge (the brand's signature tension). */}
          <motion.svg
            viewBox="0 0 32 32"
            width={size}
            height={size}
            fill="none"
            className="absolute left-0 top-1/2"
            style={{ y: "-50%" }}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 0, 0, 1, 1] }}
            transition={{
              ...baseTrans,
              times: [0, 0.3, 0.5, 0.62, 0.7, 1],
            }}
          >
            <motion.path
              d={CHEVRON_PATH}
              stroke={accentColor}
              strokeWidth="3.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={CHEVRON_LEN}
              initial={{ strokeDashoffset: CHEVRON_LEN, y: -3 }}
              animate={{
                strokeDashoffset: [CHEVRON_LEN, CHEVRON_LEN, CHEVRON_LEN, CHEVRON_LEN, 0, 0],
                // tiny drop after morph — "about to fall" beat
                y: [-3, -3, -3, -3, -1.2, 0],
              }}
              transition={{
                ...baseTrans,
                times: [0, 0.3, 0.5, 0.62, 0.82, 0.92],
              }}
            />
          </motion.svg>
        </span>
      </motion.span>
    </span>
  );
}

/* ================================================================== */
/* CsseLogoLoader — fullscreen loading page using the morph sequence  */
/* ================================================================== */

export function CsseLogoLoader({
  label = "Loading",
  size = 96,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center overflow-hidden bg-[var(--color-surface,#0A0F0D)]">
      {/* Subtle scanline texture — matches the brand's editorial grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon,#22E06B) 0 1px, transparent 1px 3px)",
        }}
      />

      {/* Soft radial glow under the mark */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute"
        style={{
          width: size * 6,
          height: size * 6,
          background:
            "radial-gradient(circle, color-mix(in oklab, var(--color-neon, #22E06B) 18%, transparent) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
        initial={{ opacity: 0.4, scale: 0.9 }}
        animate={{ opacity: [0.4, 0.7, 0.4], scale: [0.9, 1.05, 0.9] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative flex flex-col items-center gap-8">
        <CsseLogoAnimated size={size} loop duration={2.6} />

        {/* Tracking progress bar — the green of the chevron extended */}
        <div className="relative h-[2px] w-[200px] overflow-hidden bg-[var(--color-surface-border,#1C2520)]">
          <motion.div
            className="absolute inset-y-0 left-0 w-1/3"
            style={{ background: ACCENT }}
            animate={{ x: ["-100%", "300%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <span className="text-[10px] font-bold uppercase tracking-[0.42em] text-[var(--color-ink-muted,#6B7A72)]">
          {label}
        </span>
      </div>
    </div>
  );
}
