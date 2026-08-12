import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Flat 2D casino chip — solid face, hairline edge ring, no cylinder shading.
 * Presentation only.
 */
const CHIP_COLORS: { at: number; face: string; edge: string; ink: string }[] = [
  { at: 1, face: "#f2f2ef", edge: "#c9c9c2", ink: "#12181c" },
  { at: 5, face: "#d0353f", edge: "#8e1f27", ink: "#fff6f6" },
  { at: 10, face: "#2f6fd0", edge: "#1c4585", ink: "#f3f8ff" },
  { at: 25, face: "#2aa35c", edge: "#166b3a", ink: "#f2fff6" },
  { at: 50, face: "#7b3fd4", edge: "#4d248a", ink: "#f8f4ff" },
  { at: 100, face: "#1d2126", edge: "#0a0d10", ink: "#f5f7f8" },
  { at: 500, face: "#d9a441", edge: "#8d6413", ink: "#1a1204" },
];

export function paletteFor(value: number) {
  let best = CHIP_COLORS[0];
  for (const c of CHIP_COLORS) if (value >= c.at) best = c;
  return best;
}

/** Flat disc style — kept name for call-site compat. */
export function chipCylinderStyle(face: string, edge: string): React.CSSProperties {
  return {
    background: face,
    boxShadow: `0 0 0 2px ${edge}`,
  };
}

export function CasinoChip({
  value,
  selected,
  disabled,
  onClick,
  size = 52,
  accent,
}: {
  value: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  size?: number;
  accent?: string;
}) {
  const p = paletteFor(value);
  const label = value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Stake ${value} points`}
      className={cn(
        "relative shrink-0 rounded-full transition-opacity duration-100 disabled:opacity-40",
        selected ? "opacity-100" : "opacity-90 hover:opacity-100",
      )}
      style={{
        width: size,
        height: size,
      }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          ...chipCylinderStyle(p.face, p.edge),
          outline: selected ? `2px solid ${accent ?? "var(--color-neon)"}` : undefined,
          outlineOffset: "2px",
        }}
      />
      <span
        className="pointer-events-none absolute inset-[5px] rounded-full border border-dashed"
        style={{ borderColor: p.edge, opacity: 0.7 }}
      />
      <span
        className="absolute inset-0 grid place-items-center font-mono font-black tabular-nums"
        style={{ color: p.ink, fontSize: size * 0.3 }}
      >
        {label}
      </span>
    </button>
  );
}
