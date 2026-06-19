import type { SVGProps } from "react";

/* cssebets stencil nav icons — same tactical/stencil philosophy as the
   TacticalPitch / TacticalCrown / SubsBench illustrations: thin neon
   strokes, geometric, dotted/dashed accents. ViewBox 24x24. */

type IconProps = SVGProps<SVGSVGElement>;

const baseProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/* HOME — mini tactical pitch (mirrors TacticalPitch) */
export function IconHome(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="6" width="18" height="12" rx="1" />
      <line x1="12" y1="6" x2="12" y2="18" />
      <circle cx="12" cy="12" r="2.4" />
      <circle cx="12" cy="12" r="0.6" fill="currentColor" stroke="none" />
      <line x1="3" y1="9" x2="5" y2="9" />
      <line x1="3" y1="15" x2="5" y2="15" />
      <line x1="19" y1="9" x2="21" y2="9" />
      <line x1="19" y1="15" x2="21" y2="15" />
    </svg>
  );
}

/* BETS — ticket stub with neon notch */
export function IconBets(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M3 8 V7 H21 V8 a1.6 1.6 0 0 0 0 3 V17 H3 V11 a1.6 1.6 0 0 0 0 -3 Z" />
      <line x1="14" y1="7.5" x2="14" y2="16.5" strokeDasharray="1.5 1.5" />
      <circle cx="8" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <line x1="6.5" y1="14.5" x2="9.5" y2="14.5" />
    </svg>
  );
}

/* PICKS — lineup clipboard with check marks */
export function IconPicks(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="1" />
      <rect x="9" y="2.5" width="6" height="3" rx="0.6" />
      <path d="M8 10 l1.4 1.4 L12 8.8" />
      <line x1="13.5" y1="10.4" x2="17" y2="10.4" />
      <path d="M8 15 l1.4 1.4 L12 13.8" />
      <line x1="13.5" y1="15.4" x2="17" y2="15.4" />
    </svg>
  );
}

/* WALLET — chip stack vault */
export function IconWallet(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="6" width="18" height="13" rx="1.5" />
      <path d="M3 10 H21" />
      <circle cx="17" cy="14.5" r="1.4" />
      <line x1="6" y1="14.5" x2="13" y2="14.5" strokeDasharray="1.5 1.5" />
      <line x1="6" y1="6" x2="6" y2="4" />
      <line x1="10" y1="6" x2="10" y2="4" />
    </svg>
  );
}

/* PAYOUT — cashout / arrow out of vault */
export function IconPayout(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <rect x="3" y="7" width="13" height="12" rx="1.5" />
      <line x1="3" y1="11" x2="16" y2="11" />
      <circle cx="9.5" cy="15" r="1.4" />
      <path d="M14 4 H21 V11" />
      <path d="M21 4 L14.5 10.5" />
      <path d="M18.5 8.5 L21 11 L18.5 13" />
    </svg>
  );
}

/* SUPPORT — headset stencil */
export function IconSupport(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M4 14 V12 a8 8 0 0 1 16 0 v2" />
      <rect x="3" y="13" width="3.5" height="6" rx="1" />
      <rect x="17.5" y="13" width="3.5" height="6" rx="1" />
      <path d="M17.5 19 V20 a2 2 0 0 1 -2 2 H13" />
      <circle cx="11.5" cy="22" r="0.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* HELP — question marker */
export function IconHelp(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.2 9.5 a2.8 2.8 0 1 1 4.3 2.5 c-1.2 0.7 -1.5 1.3 -1.5 2.5" />
      <circle cx="12" cy="17.2" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

/* SETTINGS — cog stencil */
export function IconSettings(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="M12 3 V5 M12 19 V21 M3 12 H5 M19 12 H21 M5.6 5.6 L7 7 M17 17 L18.4 18.4 M5.6 18.4 L7 17 M17 7 L18.4 5.6" />
      <circle cx="12" cy="12" r="6" strokeDasharray="2 2" />
    </svg>
  );
}

/* LOGOUT — exit stencil */
export function IconLogout(props: IconProps) {
  return (
    <svg {...baseProps} {...props}>
      <path d="M14 4 H6 a1.5 1.5 0 0 0 -1.5 1.5 v13 A1.5 1.5 0 0 0 6 20 H14" />
      <path d="M11 12 H21" />
      <path d="M18 9 L21 12 L18 15" />
    </svg>
  );
}
