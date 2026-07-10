import type { ReactNode } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Props = {
  /** kept for backwards compat — no longer rendered by default */
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  /** kept for backwards compat; ignored in the minimal shell */
  accent?: boolean;
  size?: "sm" | "md" | "lg";
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onPointerDownOutside?: (e: any) => void;
};

/**
 * Minimal, Kalshi-inspired dialog shell for the cashout / payout flows.
 * Thin border, generous whitespace, one clear hierarchy, subtle scale-in.
 */
export function StencilDialogContent({
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
      className={`${max} gap-0 rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-0 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] data-[state=open]:animate-scale-in`}
    >
      <DialogHeader className="space-y-1.5 px-6 pt-6 pb-2 text-left">
        <DialogTitle className="font-display text-[19px] font-semibold leading-tight tracking-tight text-[var(--color-ink)]">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>

      {children && <div className="px-6 pt-4 pb-2">{children}</div>}

      {footer && (
        <div className="flex flex-col-reverse gap-2 px-6 pt-4 pb-6 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </DialogContent>
  );
}
