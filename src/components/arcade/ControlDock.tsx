import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared arcade control dock.
 *
 * One consistent, mobile-first console for every arcade game:
 *  - dock padding 12–16px, 8px gaps between rows
 *  - primary action 52px, segmented selectors 44px, input rows 44px
 *  - every interactive target is at least 44x44
 *
 * Visual identity (dark surfaces, neon accent, rounded styling) is unchanged.
 */

export function ControlDock({
  children,
  className,
  maxWidth = "max-w-4xl",
}: {
  children: React.ReactNode;
  className?: string;
  maxWidth?: string;
}) {
  return (
    <div
      data-arcade-console
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 pb-[calc(64px+env(safe-area-inset-bottom))] backdrop-blur md:pb-[env(safe-area-inset-bottom)]"
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-2 px-3 py-2 sm:px-4",
          maxWidth,
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** A single control row. `scroll` enables silent horizontal overflow. */
export function DockRow({
  children,
  className,
  scroll,
}: {
  children: React.ReactNode;
  className?: string;
  scroll?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2",
        scroll &&
          "overflow-x-auto overflow-y-visible [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Primary call to action — 52px tall, full width by default. */
export function DockPrimary({
  children,
  onClick,
  disabled,
  loading,
  active = true,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  /** Shows a spinner and blocks interaction. */
  loading?: boolean;
  /** Whether the button renders in its filled (enabled-looking) state. */
  active?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        "flex h-[52px] w-full min-w-0 items-center justify-center gap-1.5 rounded-full",
        "font-display text-[13px] font-bold uppercase tracking-[0.08em] transition-all",
        active && !disabled
          ? "bg-[var(--color-neon)] text-black active:opacity-90"
          : "border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] text-[var(--color-ink-muted)]",
        "disabled:cursor-not-allowed",
        className,
      )}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </button>
  );
}

/** Segmented selector — 44px tall, 44px minimum per option. */
export function DockSeg({
  options,
  value,
  onChange,
  disabled,
  className,
  grow,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
  className?: string;
  /** Stretch to fill the row and share width equally. */
  grow?: boolean;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex h-11 shrink-0 items-center gap-0.5 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-1",
        grow && "w-full min-w-0 shrink",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(o.key)}
            className={cn(
              "h-9 min-w-11 rounded-full px-3 text-[11px] font-bold uppercase tracking-[0.04em] transition-colors disabled:opacity-40",
              grow && "flex-1",
              active
                ? "bg-[var(--color-neon)] text-black"
                : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** 44px input / stepper shell. */
export function DockField({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 min-w-0 items-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-3",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 44x44 utility button used for undo / clear / repeat style actions. */
export function DockIconButton({
  children,
  onClick,
  disabled,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-surface-2)]/70 disabled:opacity-35",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Compact read-out (stake, payout, next multiplier…). */
export function DockReadout({
  label,
  value,
  hint,
  align = "right",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <div className={cn("shrink-0 leading-tight", align === "right" && "text-right", className)}>
      <div className="text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--color-ink-muted)]">
        {label}
      </div>
      <div className="font-display text-[13px] font-bold tabular-nums text-[var(--color-ink)]">
        {value}
      </div>
      {hint ? (
        <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-neon)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/** Single-line warning / helper text under the controls. */
export function DockNote({
  children,
  tone = "warn",
}: {
  children: React.ReactNode;
  tone?: "warn" | "muted";
}) {
  return (
    <p
      className={cn(
        "text-center text-[10px] font-bold uppercase tracking-[0.06em]",
        tone === "warn" ? "text-amber-300" : "text-[var(--color-ink-muted)]",
      )}
    >
      {children}
    </p>
  );
}
