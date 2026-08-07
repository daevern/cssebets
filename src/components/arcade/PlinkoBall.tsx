import { memo } from "react";

/** Cyan/blue arcade ball (SVG, rendered inside the board's <svg>). */
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
  return (
    <g>
      <circle cx={cx} cy={cy} r={16} fill="url(#ballGlow)" />
      <circle cx={cx} cy={cy} r={9} fill={accent ?? "#33CFFF"} opacity={0.35} />
      <circle cx={cx} cy={cy} r={7} fill="url(#ballBody)" />
      <circle
        cx={cx}
        cy={cy}
        r={7}
        fill="none"
        stroke={fill ? (accent ?? "#33CFFF") : "#33CFFF"}
        strokeWidth={1.2}
        strokeOpacity={0.9}
      />
      <circle cx={cx - 2.2} cy={cy - 2.4} r={2.2} fill="#F4FFFF" />
    </g>
  );
}

export const PlinkoBall = memo(PlinkoBallImpl);
