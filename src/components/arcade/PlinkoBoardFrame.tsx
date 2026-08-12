import { memo } from "react";

/** Flat 2D Plinko cabinet rails. */
function PlinkoBoardFrameImpl({
  left,
  right,
  stroke = "#6b76c4",
}: {
  left: string;
  right: string;
  stroke?: string;
}) {
  return (
    <g>
      <path
        d={left}
        fill="none"
        stroke={stroke}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
      />
      <path
        d={right}
        fill="none"
        stroke={stroke}
        strokeWidth={5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.95}
      />
    </g>
  );
}

export const PlinkoBoardFrame = memo(PlinkoBoardFrameImpl);
