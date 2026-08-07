import { useState } from "react";
import { cn } from "@/lib/utils";
import { CasinoChip } from "@/components/arcade/CasinoChip";
import { CsseMark } from "@/components/brand/CsseMark";

/** Standard denominations offered by every arcade table. */
export const CHIP_LADDER = [1, 5, 10, 25, 50, 100, 500, 1000];

/**
 * CSSEBets house chip — identical physical aesthetic to CasinoChip
 * (flat face + dashed edge ring) but branded: black face, white edge,
 * green mark. Logo only, no wordmark.
 */
export function BrandChip({
  size = 44,
  open,
  disabled,
  onClick,
}: {
  size?: number;
  open?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "Hide chips" : "Choose a chip"}
      className={cn(
        "relative shrink-0 rounded-full transition-opacity duration-150 disabled:opacity-40",
        open ? "opacity-100" : "opacity-90 hover:opacity-100",
      )}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: "#0d1113",
          boxShadow: open ? "0 0 0 2px var(--color-neon)" : "none",
        }}
      />
      <span
        className="absolute inset-[6px] rounded-full border-2 border-dashed"
        style={{ borderColor: "#f4f6f5" }}
      />
      <span className="absolute inset-0 grid place-items-center">
        <CsseMark style={{ width: size * 0.44, height: size * 0.44 }} />
      </span>
    </button>
  );
}

/**
 * Expandable stake rack: one branded chip that unfolds into the real
 * denominations, keeping every arcade console compact on mobile.
 */
export function ChipRack({
  values,
  value,
  onSelect,
  size = 44,
  max,
  disabled,
  isChipDisabled,
  className,
}: {
  values?: number[];
  value: number;
  onSelect: (v: number) => void;
  size?: number;
  /** Hide denominations above the table limit. */
  max?: number;
  disabled?: boolean;
  isChipDisabled?: (v: number) => boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  const denominations = Array.from(new Set([...(values ?? []), ...CHIP_LADDER]))
    .filter((v) => Number.isFinite(v) && v > 0 && (max == null || v <= max))
    .sort((a, b) => a - b);

  return (
    <div className={cn("flex min-w-0 items-center gap-1.5", className)}>
      <BrandChip size={size} open={open} disabled={disabled} onClick={() => setOpen((o) => !o)} />

      {!open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-[4px] bg-[var(--color-surface-2)] px-2.5 py-1 text-left disabled:opacity-40"
        >
          <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Chip
          </div>
          <div className="font-display text-xs font-bold tabular-nums text-[var(--color-ink)]">
            {value.toLocaleString()}
          </div>
        </button>
      ) : (
        <div className="flex shrink-0 items-center gap-1.5 py-1">
          {denominations.map((v) => (
            <span key={v} className="animate-[scale-in_0.15s_ease-out]">
              <CasinoChip
                value={v}
                size={size}
                selected={value === v}
                disabled={disabled || isChipDisabled?.(v)}
                onClick={() => {
                  onSelect(v);
                  setOpen(false);
                }}
              />
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
