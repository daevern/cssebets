import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Casino chip button rendered as a short cylinder: face disc, darker edge
 * ring, dashed inlay and a contact shadow on the felt. Colours are chip
 * denominations (a physical casino artifact); the selection ring uses the
 * cabinet accent so the chips stay inside the CSSEBets theme.
 * Geometry/presentation only — no stake logic here.
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

/** Shared cylinder shading used by every chip in the app. */
export function chipCylinderStyle(face: string, edge: string): React.CSSProperties {
  return {
    background: `radial-gradient(72% 68% at 38% 26%, color-mix(in srgb, ${face} 88%, #ffffff) 0%, ${face} 52%, color-mix(in srgb, ${face} 78%, #000000) 100%)`,
    boxShadow: [
      `0 0 0 3px ${edge}`,
      `0 3px 0 0 color-mix(in srgb, ${edge} 70%, #000000)`,
      "0 6px 10px -4px rgba(0,0,0,.75)",
      "inset 0 1px 0 rgba(255,255,255,.45)",
      "inset 0 -3px 6px rgba(0,0,0,.35)",
    ].join(", "),
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
  /** Cabinet accent for the selection ring (defaults to the neon token). */
  accent?: string;
}) {
  const p = paletteFor(value);
  const label = value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
  const [squash, setSquash] = React.useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setSquash(true);
        window.setTimeout(() => setSquash(false), 90);
        onClick?.();
      }}
      aria-label={`Stake ${value} points`}
      className={cn(
        "relative shrink-0 rounded-full transition-[opacity,transform] duration-100 disabled:opacity-40 motion-reduce:transition-none",
        selected ? "opacity-100" : "opacity-90 hover:opacity-100",
      )}
      style={{
        width: size,
        height: size,
        transform: squash ? "scaleY(.86) scaleX(1.06) translateY(2px)" : undefined,
      }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          ...chipCylinderStyle(p.face, p.edge),
          outline: selected ? `2px solid ${accent ?? "var(--color-neon)"}` : undefined,
          outlineOffset: "3px",
        }}
      />
      <span
        className="pointer-events-none absolute inset-[6px] rounded-full border-2 border-dashed"
        style={{ borderColor: p.edge, opacity: 0.85 }}
      />
      <span
        className="absolute inset-0 grid place-items-center font-mono font-black tabular-nums"
        style={{ color: p.ink, fontSize: size * 0.3, textShadow: "0 1px 0 rgba(0,0,0,.18)" }}
      >
        {label}
      </span>
    </button>
  );
}
