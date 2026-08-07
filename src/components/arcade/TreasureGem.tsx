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
          ? "drop-shadow(0 0 6px rgba(255,47,220,.7)) drop-shadow(0 0 14px rgba(186,32,255,.45))"
          : undefined,
        animation: animate ? "tgemPop 380ms cubic-bezier(.34,1.56,.64,1)" : undefined,
      }}
    >
      {/* crown */}
      <polygon points="50,8 78,26 68,36 32,36 22,26" fill="#FF49DF" />
      <polygon points="50,8 78,26 68,36 50,30" fill="#FFD5FF" opacity=".75" />
      <polygon points="22,26 50,8 50,30 32,36" fill="#E619D7" />
      {/* girdle band */}
      <polygon points="22,26 32,36 68,36 78,26 92,38 8,38" fill="#A80CC9" opacity=".85" />
      {/* pavilion facets */}
      <polygon points="8,38 32,36 42,62 20,50" fill="#E619D7" />
      <polygon points="32,36 50,30 50,66 42,62" fill="#FF49DF" />
      <polygon points="50,30 68,36 58,62 50,66" fill="#A80CC9" />
      <polygon points="68,36 92,38 80,50 58,62" fill="#68129A" />
      {/* tip */}
      <polygon points="20,50 42,62 50,92 50,66" fill="#68129A" />
      <polygon points="50,66 50,92 58,62 80,50" fill="#3E0967" />
      {/* highlights */}
      <polygon points="34,38 46,34 44,56" fill="#FFD5FF" opacity=".45" />
      <polygon points="26,28 46,14 40,30" fill="#FFFFFF" opacity=".35" />
    </svg>
  );
}

export const TreasureGem = memo(TreasureGemImpl);
