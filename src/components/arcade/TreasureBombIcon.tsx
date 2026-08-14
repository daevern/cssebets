import { memo } from "react";

/**
 * Custom embossed arcade mine/bomb (pure SVG — no emoji, no icon library).
 * Kept mostly monochromatic so unrevealed tiles stay mysterious.
 */
function TreasureBombIconImpl({
  className,
  bright = false,
}: {
  className?: string;
  bright?: boolean;
}) {
  const body = bright ? "#3c5568" : "#24384a";
  const shade = bright ? "#1b2c3a" : "#141f29";
  const face = bright ? "rgba(255,180,255,.5)" : "rgba(180,120,255,.22)";
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden focusable="false">
      <defs>
        <radialGradient id="tbombBody" cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor={bright ? "#557086" : "#2f4553"} />
          <stop offset="60%" stopColor={body} />
          <stop offset="100%" stopColor={shade} />
        </radialGradient>
      </defs>
      {/* fuse */}
      <path
        d="M58 26 C64 16, 74 18, 76 10"
        fill="none"
        stroke={shade}
        strokeWidth="6"
        strokeLinecap="round"
      />
      {/* side nubs */}
      <rect x="8" y="56" width="12" height="8" rx="4" fill={shade} />
      <rect x="80" y="56" width="12" height="8" rx="4" fill={shade} />
      {/* body */}
      <circle cx="50" cy="60" r="32" fill="url(#tbombBody)" />
      {/* cap */}
      <rect x="42" y="24" width="16" height="10" rx="3" fill={shade} />
      {/* highlight */}
      <ellipse cx="38" cy="46" rx="9" ry="6" fill="#ffffff" opacity={bright ? 0.3 : 0.16} />
      {/* skull face */}
      <circle cx="41" cy="58" r="5" fill={face} />
      <circle cx="59" cy="58" r="5" fill={face} />
      <rect x="45" y="70" width="10" height="5" rx="2" fill={face} />
    </svg>
  );
}

export const TreasureBombIcon = memo(TreasureBombIconImpl);
