import type { SVGProps } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* PULSE — heartbeat line on a scoreboard frame */
export function IconPulse(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <path d="M4 12 H8 L10 8 L13 16 L15 12 H20" />
      <circle cx="20" cy="12" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* SHIELD — trust shield with neon tick */
export function IconShield(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 L4 6 V12 c0 5 3.5 8 8 9 c4.5 -1 8 -4 8 -9 V6 Z" />
      <path d="M8.5 12 L11 14.4 L15.5 9.8" />
    </svg>
  );
}

/* TIMELINE — stenciled dotted track with check marks */
export function IconTimeline(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="6" y1="4" x2="6" y2="20" strokeDasharray="2 2" />
      <circle cx="6" cy="7" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="6" cy="17" r="1.6" />
      <line x1="10" y1="7" x2="20" y2="7" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="17" x2="16" y2="17" />
    </svg>
  );
}

/* BADGE — laurel + center pip */
export function IconBadge(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="10" r="5" />
      <path d="M8 14 L6 22 L12 19 L18 22 L16 14" />
      <circle cx="12" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* STATUS — broadcast tower */
export function IconBroadcast(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M5 9 a8 8 0 0 1 14 0" />
      <path d="M7.5 11.5 a5 5 0 0 1 9 0" />
      <circle cx="12" cy="14" r="1.6" fill="currentColor" stroke="none" />
      <path d="M10 22 L12 15 L14 22" />
    </svg>
  );
}

/* COMMUNITY — three nodes linked */
export function IconCommunity(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <circle cx="6" cy="7" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
      <path d="M7.5 8.5 L10.5 15.5" strokeDasharray="2 2" />
      <path d="M16.5 8.5 L13.5 15.5" strokeDasharray="2 2" />
      <path d="M8 7 H16" strokeDasharray="2 2" />
    </svg>
  );
}

/* CHANGELOG — stacked notes */
export function IconChangelog(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="13" height="3" rx="0.5" />
      <rect x="5" y="9" width="13" height="3" rx="0.5" />
      <rect x="5" y="14" width="13" height="3" rx="0.5" />
      <line x1="8" y1="5.5" x2="14" y2="5.5" strokeDasharray="1.5 1.5" />
      <line x1="8" y1="10.5" x2="14" y2="10.5" strokeDasharray="1.5 1.5" />
      <line x1="8" y1="15.5" x2="14" y2="15.5" strokeDasharray="1.5 1.5" />
      <circle cx="20" cy="5.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="20" cy="10.5" r="0.7" fill="currentColor" stroke="none" />
      <circle cx="20" cy="15.5" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}
