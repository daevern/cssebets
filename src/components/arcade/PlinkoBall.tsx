import { memo } from "react";

/** Flat 2D arcade ball (SVG). */
function PlinkoBallImpl({
  cx,
  cy,
  fill,
  accent,
}: {
  cx: number;
  cy: number;
  fill?: string | null;
  accent?: string | null;
}) {
  const body = fill ?? "#8f9bff";
  const rim = accent ?? "#c9d1ff";
  return (
    <g>
      <circle cx={cx} cy={cy} r={7} fill={body} />
      <circle cx={cx} cy={cy} r={7} fill="none" stroke={rim} strokeWidth={1.2} />
    </g>
  );
}

export const PlinkoBall = memo(PlinkoBallImpl);
