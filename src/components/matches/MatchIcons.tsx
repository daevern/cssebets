/* Custom CSSEBets match iconography — hand-tuned SVGs replacing emoji.
   Stencil-style strokes match the dashboard / matches NavIcons philosophy:
   2px primary strokes, neon accents, dashed details, no fills unless needed. */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Frame({ size = 16, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      {...rest}
    >
      {children}
    </svg>
  );
}

/* Goal — football with motion dashes behind, square stencil. */
export function GoalIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <circle cx="14" cy="12" r="5.5" />
      <path d="M14 8.5l1.7 1.4-.7 2H13l-.7-2L14 8.5z" fill="currentColor" stroke="none" />
      <path d="M14 6.5v2M9 12h2M14 15.5v2M17 12h2" />
      <path d="M3 9h3M3 12h4M3 15h3" strokeDasharray="2 2" opacity="0.7" />
    </Frame>
  );
}

/* Penalty — crosshair target ring. */
export function PenaltyIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="3.5" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </Frame>
  );
}

/* Own goal — ball with reverse arrow. */
export function OwnGoalIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <circle cx="13" cy="12" r="5" />
      <path d="M13 9.5l1.4 1.1-.5 1.7h-1.8l-.5-1.7 1.4-1.1z" fill="currentColor" stroke="none" />
      <path d="M6 17l-3-3 3-3" />
      <path d="M3 14h9" strokeDasharray="2 2" />
    </Frame>
  );
}

/* Yellow card — filled rounded square. */
export function YellowCardIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      <rect x="7.5" y="3" width="9.5" height="14" rx="1" fill="#FACC15" stroke="#000" strokeWidth="1" />
      <rect x="7.5" y="3" width="9.5" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}

/* Red card — filled rounded square. */
export function RedCardIcon({ size = 16, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...rest}>
      <rect x="7.5" y="3" width="9.5" height="14" rx="1" fill="#DC2626" stroke="#000" strokeWidth="1" />
    </svg>
  );
}

/* Substitution — opposing arrows in/out. */
export function SubIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <path d="M4 8h13l-3-3" stroke="#22E06B" />
      <path d="M17 8l-3 3" stroke="#22E06B" />
      <path d="M20 16H7l3-3" stroke="#F87171" />
      <path d="M7 16l3 3" stroke="#F87171" />
    </Frame>
  );
}

/* VAR — monitor with check. */
export function VarIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <rect x="3" y="4" width="18" height="12" />
      <path d="M9 20h6M12 16v4" />
      <path d="M8.5 10.5l2 2 4-4.5" stroke="#22E06B" />
    </Frame>
  );
}

/* Whistle — for kickoff / FT / HT. */
export function WhistleIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <path d="M3 11h12l4-3v8l-4-3" />
      <circle cx="9" cy="13" r="3" />
      <path d="M20 6l1.5-1.5" strokeDasharray="2 2" />
    </Frame>
  );
}

/* Pitch / venue marker. */
export function PitchIcon(p: IconProps) {
  return (
    <Frame {...p}>
      <rect x="2.5" y="6" width="19" height="12" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <circle cx="12" cy="12" r="2" />
      <rect x="2.5" y="9" width="3" height="6" />
      <rect x="18.5" y="9" width="3" height="6" />
    </Frame>
  );
}

/* Pick the right event icon given API-Football type/detail. */
export function eventMark(type: string, detail: string | null, size = 14) {
  const t = (type || "").toLowerCase();
  const d = (detail || "").toLowerCase();
  if (t === "goal") {
    if (d.includes("own")) return <OwnGoalIcon size={size} className="text-[var(--color-neon)]" />;
    if (d.includes("penalty")) return <PenaltyIcon size={size} className="text-[var(--color-neon)]" />;
    return <GoalIcon size={size} className="text-[var(--color-neon)]" />;
  }
  if (t === "card") {
    if (d.includes("red")) return <RedCardIcon size={size} />;
    return <YellowCardIcon size={size} />;
  }
  if (t === "subst") return <SubIcon size={size} />;
  if (t === "var") return <VarIcon size={size} className="text-[var(--color-ink-muted)]" />;
  return <span className="block h-1 w-1 rounded-full bg-[var(--color-neon)]" />;
}
