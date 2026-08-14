import { memo } from "react";

/**
 * Custom faceted treasure gemstone (pure SVG — no emoji, no icon library).
 * Purely presentational.
 */
function TreasureGemImpl({
  className,
  glow = true,
  animate = false,
}: {
  className?: string;
  glow?: boolean;
  animate?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Treasure gem"
      style={{
        filter: glow
          ? "drop-shadow(0 0 6px rgba(0,231,1,.55)) drop-shadow(0 0 14px rgba(0,231,1,.3))"
          : undefined,
        animation: animate ? "tgemPop 380ms cubic-bezier(.34,1.56,.64,1)" : undefined,
      }}
    >
      {/* crown */}
      <polygon points="50,8 78,26 68,36 32,36 22,26" fill="#4dff6b" />
      <polygon points="50,8 78,26 68,36 50,30" fill="#d9ffe2" opacity=".75" />
      <polygon points="22,26 50,8 50,30 32,36" fill="#00e701" />
      {/* girdle band */}
      <polygon points="22,26 32,36 68,36 78,26 92,38 8,38" fill="#00b81a" opacity=".85" />
      {/* pavilion facets */}
      <polygon points="8,38 32,36 42,62 20,50" fill="#00e701" />
      <polygon points="32,36 50,30 50,66 42,62" fill="#4dff6b" />
      <polygon points="50,30 68,36 58,62 50,66" fill="#00b81a" />
      <polygon points="68,36 92,38 80,50 58,62" fill="#04751a" />
      {/* tip */}
      <polygon points="20,50 42,62 50,92 50,66" fill="#04751a" />
      <polygon points="50,66 50,92 58,62 80,50" fill="#044212" />
      {/* highlights */}
      <polygon points="34,38 46,34 44,56" fill="#d9ffe2" opacity=".45" />
      <polygon points="26,28 46,14 40,30" fill="#FFFFFF" opacity=".35" />
    </svg>
  );
}

export const TreasureGem = memo(TreasureGemImpl);
