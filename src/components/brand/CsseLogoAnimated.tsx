import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* CsseLogoAnimated                                                    */
/*                                                                     */
/* Bespoke entrance animation for the CSSEBets identity. The wordmark  */
/* "CSSE" and "Bets" slide inward and merge into the geometric mark:   */
/*   • "CSSE" letters collapse rightward into the white C-wedge        */
/*   • "Bets" letters collapse leftward into the green inner chevron   */
/*   • Once the type lands, the mark's strokes draw in to "complete"   */
/*     the merge — type becomes form.                                   */
/*                                                                     */
/* Reused as the nav lockup and (via the `loop` prop) as a loader.     */
/* ------------------------------------------------------------------ */

const BRAND_FONT =
  '"Space Grotesk", "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

const ACCENT = "oklch(0.78 0.19 145)";
const WEDGE_PATH = "M24 7 L11 7 L4 16 L11 25 L24 25";
const CHEVRON_PATH = "M15 21 L21 14 L27 21";

// Approx stroke-lengths for the draw-on animation (measured manually on
// the 32-unit grid: wedge ≈ 50 units, chevron ≈ 17 units).
const WEDGE_LEN = 52;
const CHEVRON_LEN = 18;

export interface CsseLogoAnimatedProps {
  /** Mark size in px. Wordmark cap-height auto-derives from this. */
  size?: number;
  /** Loop the animation forever — use for loading states. */
  loop?: boolean;
  /** Delay before the animation starts (s). */
  delay?: number;
  /** Total animation duration (s). Default 1.6s. */
  duration?: number;
  /** Force the mark colors regardless of theme. */
  inverse?: boolean;
  className?: string;
  /** Accessible label. */
  title?: string;
}

export function CsseLogoAnimated({
  size = 36,
  loop = false,
  delay = 0,
  duration = 1.6,
  inverse = false,
  className,
  title = "CSSEBets",
}: CsseLogoAnimatedProps) {
  const reduce = useReducedMotion();

  const wedgeColor = inverse ? "#0B1220" : "var(--color-ink, #fff)";
  const accentColor = ACCENT;

  // Wordmark cap-height. The two halves animate independently so we tune
  // size to feel balanced against the mark.
  const capHeight = Math.round(size * 0.72);
  const trackWidth = Math.round(size * 3.3); // total animation track width

  // Timing fractions (of `duration`).
  const t = (frac: number) => frac * duration;

  // Shared transition for the looped sequence — gives a brief hold before
  // restarting so the mark is legible at the end of each cycle.
  const repeat = loop ? { repeat: Infinity, repeatDelay: 0.6 } : {};

  if (reduce) {
    // Static fallback: just the mark + wordmark, no motion.
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
            fontSize: capHeight,
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

  return (
    <span
      className={cn("relative inline-flex items-center justify-start select-none", className)}
      style={{ height: size, width: trackWidth }}
      aria-label={title}
      role="img"
    >
      {/* ---------- The mark (anchored on the left) ---------- */}
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        className="absolute left-0 top-1/2 -translate-y-1/2"
        aria-hidden
      >
        <motion.path
          d={WEDGE_PATH}
          stroke={wedgeColor}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={WEDGE_LEN}
          initial={{ strokeDashoffset: WEDGE_LEN, opacity: 0 }}
          animate={{
            strokeDashoffset: [WEDGE_LEN, WEDGE_LEN, 0, 0],
            opacity: [0, 0, 1, 1],
          }}
          transition={{
            duration,
            delay,
            times: [0, 0.45, 0.85, 1],
            ease: "easeInOut",
            ...repeat,
          }}
        />

        <motion.path
          d={CHEVRON_PATH}
          stroke={accentColor}
          strokeWidth="3.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHEVRON_LEN}
          initial={{ strokeDashoffset: CHEVRON_LEN, opacity: 0 }}
          animate={{
            strokeDashoffset: [CHEVRON_LEN, CHEVRON_LEN, 0, 0],
            opacity: [0, 0, 1, 1],
          }}
          transition={{
            duration,
            delay,
            times: [0, 0.55, 0.95, 1],
            ease: "easeInOut",
            ...repeat,
          }}
        />

        {/* Subtle pulse on the chevron after merge — sells the "alive" feel. */}
        {loop && (
          <motion.circle
            cx="21"
            cy="14"
            r="0.8"
            fill={accentColor}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 0, 1, 0], scale: [0, 0, 2.4, 3.6] }}
            transition={{
              duration,
              delay,
              times: [0, 0.9, 0.95, 1],
              ease: "easeOut",
              ...repeat,
            }}
          />
        )}
      </svg>

      {/* ---------- The wordmark halves that merge into the mark ---------- */}
      <span
        className="absolute left-0 top-1/2 -translate-y-1/2 flex items-baseline"
        style={{
          fontFamily: BRAND_FONT,
          fontWeight: 700,
          fontSize: capHeight,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          paddingLeft: size + Math.round(size * 0.25),
          transform: "translateY(-50%)",
        }}
      >
        {/* "CSSE" — collapses leftward into the white wedge */}
        <motion.span
          style={{ color: wedgeColor, display: "inline-block", transformOrigin: "left center" }}
          initial={{ x: 0, scaleX: 1, opacity: 1, letterSpacing: "-0.02em" }}
          animate={{
            x: [0, 0, -size * 0.9, -size * 0.9],
            scaleX: [1, 1, 0.05, 0.05],
            opacity: [1, 1, 0, 0],
            letterSpacing: ["-0.02em", "-0.02em", "-0.18em", "-0.18em"],
          }}
          transition={{
            duration,
            delay,
            times: [0, 0.05, 0.55, 1],
            ease: [0.7, 0, 0.3, 1],
            ...repeat,
          }}
        >
          CSSE
        </motion.span>

        {/* "Bets" — collapses leftward into the green chevron */}
        <motion.span
          style={{ color: accentColor, display: "inline-block", transformOrigin: "left center" }}
          initial={{ x: 0, scaleX: 1, opacity: 1, letterSpacing: "-0.02em" }}
          animate={{
            x: [0, 0, -size * 1.55, -size * 1.55],
            scaleX: [1, 1, 0.05, 0.05],
            opacity: [1, 1, 0, 0],
            letterSpacing: ["-0.02em", "-0.02em", "-0.18em", "-0.18em"],
          }}
          transition={{
            duration,
            delay: delay + 0.08,
            times: [0, 0.05, 0.55, 1],
            ease: [0.7, 0, 0.3, 1],
            ...repeat,
          }}
        >
          Bets
        </motion.span>
      </span>
    </span>
  );
}

/* ---------- Fullscreen loader variant ---------- */

export function CsseLogoLoader({
  label = "Loading",
  size = 96,
}: {
  label?: string;
  size?: number;
}) {
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-[var(--color-surface,#0A0F0D)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon,#22E06B) 0 1px, transparent 1px 3px)",
        }}
      />
      <div className="relative flex flex-col items-center gap-6">
        <CsseLogoAnimated size={size} loop duration={1.8} />
        <span className="text-[10px] font-bold uppercase tracking-[0.42em] text-[var(--color-ink-muted,#6B7A72)]">
          {label}
        </span>
      </div>
    </div>
  );
}
