import type { ReactNode } from "react";
import { DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Corner } from "@/components/ui/page-shell";

type Props = {
  kicker: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  accent?: boolean;
  size?: "sm" | "md" | "lg";
  onEscapeKeyDown?: (e: KeyboardEvent) => void;
  onPointerDownOutside?: (e: any) => void;
};

/**
 * Stencil-styled dialog content matching cssebets design language:
 * corner accents, neon uppercase kicker, dashed divider, display serif title.
 */
export function StencilDialogContent({
  kicker,
  title,
  description,
  children,
  footer,
  accent = false,
  size = "sm",
  onEscapeKeyDown,
  onPointerDownOutside,
}: Props) {
  const max = size === "lg" ? "max-w-3xl" : size === "md" ? "max-w-md" : "max-w-sm";
  return (
    <DialogContent
      onEscapeKeyDown={onEscapeKeyDown}
      onPointerDownOutside={onPointerDownOutside}
      className={`${max} gap-0 rounded-none border p-0 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)] bg-[var(--color-surface-2)] ${
        accent ? "border-[var(--color-neon)]/40" : "border-[var(--color-surface-border)]"
      }`}
    >
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />

      <div className="border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          {kicker}
        </span>
      </div>

      <DialogHeader className="space-y-1.5 px-5 pt-5">
        <DialogTitle className="font-display text-xl font-bold leading-tight tracking-tight text-[var(--color-ink)]">
          {title}
        </DialogTitle>
        {description && (
          <DialogDescription className="text-sm text-[var(--color-ink-muted)]">
            {description}
          </DialogDescription>
        )}
      </DialogHeader>

      {children && <div className="px-5 py-5">{children}</div>}

      {footer && (
        <div className="flex flex-col-reverse gap-2 border-t border-dashed border-[var(--color-surface-border)] px-5 py-4 sm:flex-row sm:justify-end">
          {footer}
        </div>
      )}
    </DialogContent>
  );
}
