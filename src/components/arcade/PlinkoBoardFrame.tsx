import { memo } from "react";

/** Stylized zig-zag blue/violet Plinko cabinet frame (SVG paths supplied by the board). */
function PlinkoBoardFrameImpl({ left, right }: { left: string; right: string }) {
  return (
    <g style={{ filter: "drop-shadow(0 0 6px rgba(88,101,255,.55))" }}>
      <path
        d={left}
        fill="none"
        stroke="url(#wallG)"
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.92}
      />
      <path
        d={right}
        fill="none"
        stroke="url(#wallG)"
        strokeWidth={7}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.92}
      />
      <path d={left} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinejoin="round" />
      <path d={right} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={2} strokeLinejoin="round" />
    </g>
  );
}

export const PlinkoBoardFrame = memo(PlinkoBoardFrameImpl);
