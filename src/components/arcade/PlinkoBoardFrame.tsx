import { memo } from "react";

/** Stylized zig-zag blue/violet Plinko cabinet frame (SVG paths supplied by the board). */
function PlinkoBoardFrameImpl({ left, right }: { left: string; right: string }) {
  return (
    <g>
      <path
        d={left}
        fill="none"
        stroke="#6b76c4"
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
      />
      <path
        d={right}
        fill="none"
        stroke="#6b76c4"
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
      />
    </g>
  );
}

export const PlinkoBoardFrame = memo(PlinkoBoardFrameImpl);
