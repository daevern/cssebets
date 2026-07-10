import type { ReactNode } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Props = {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onPointerDownOutside?: (e: any) => void;
};

/**
 * CSSE-branded dialog shell.
 * - Deep pitch-dark surface with hairline neon top border
 * - Stencil L-corner accent (top-left) matching the fixture card language
 * - Uppercase tracked kicker in place of a heavy title chrome
 * - Minimal, generous whitespace, one clear hierarchy
 */
export function StencilDialogContent({
  kicker,
  title,
  description,
  children,
  footer,
  size = "sm",
  onEscapeKeyDown,
  onPointerDownOutside,
}: Props) {
  const max = size === "lg" ? "max-w-2xl" : size === "md" ? "max-w-md" : "max-w-[380px]";
  return (
    <DialogContent
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      className={`${max} next-fixture-corner grid max-h-[92dvh] grid-rows-[auto_1fr_auto] gap-0 overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-0 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.85)] data-[state=open]:animate-scale-in`}
    >
      {/* hairline neon top edge */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(var(--neon-glow-rgb),0.55) 25%, rgba(var(--neon-glow-rgb),0.55) 75%, transparent 100%)",
        }}
      />
      {/* faint radial glow behind header */}
      <div
        className="pointer-events-none absolute -top-24 left-1/2 h-48 w-64 -translate-x-1/2 opacity-40 blur-2xl"
        style={{
          background:
            "radial-gradient(closest-side, rgba(var(--neon-glow-rgb),0.18), transparent 70%)",
        }}
      />

      <DialogHeader className="relative shrink-0 space-y-2 px-5 pt-5 pb-2 text-left sm:px-6 sm:pt-6">
        {kicker !== undefined ? (
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-neon)]/90">
            <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon-glow)]" />
            {kicker}
          </div>
        ) : null}
        <DialogTitle className="font-display text-[20px] font-semibold leading-tight tracking-tight text-[var(--color-ink)]">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-[12.5px] leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>

      {children && (
        <div className="relative min-h-0 overflow-y-auto px-5 pt-4 pb-2 sm:px-6">
          {children}
        </div>
      )}

      {footer && (
        <div className="relative shrink-0 flex flex-col-reverse gap-2 border-t border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/40 px-5 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
          {footer}
        </div>
      )}
    </DialogContent>
  );
}
