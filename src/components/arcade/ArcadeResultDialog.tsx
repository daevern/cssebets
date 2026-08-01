import type { ReactNode } from "react";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { cn } from "@/lib/utils";

export type ArcadeResultTone = "win" | "loss" | "push";

/**
 * Shared celebratory / result pop-up for arcade games.
 * Shows the headline outcome, the net amount and optional detail + actions.
 */
export function ArcadeResultDialog({
  open,
  onOpenChange,
  tone,
  headline,
  net,
  detail,
  footer,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tone: ArcadeResultTone;
  headline: string;
  net: number;
  detail?: ReactNode;
  footer?: ReactNode;
}) {
  const colour =
    tone === "win"
      ? "text-[var(--color-neon)]"
      : tone === "loss"
        ? "text-red-400"
        : "text-[var(--color-ink)]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StencilDialogContent
        kicker={tone === "win" ? "Round settled" : tone === "loss" ? "Round settled" : "Push"}
        title={headline}
        footer={
          <>
            {footer}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-9 rounded-full bg-[var(--color-neon)] px-5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-black"
            >
              Continue
            </button>
          </>
        }
      >
        <div className="pb-2 text-center">
          <div className={cn("font-display text-[40px] font-black leading-none tabular-nums", colour)}>
            {net > 0 ? "+" : ""}
            {net.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            points
          </div>
          {detail && (
            <div className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
              {detail}
            </div>
          )}
        </div>
      </StencilDialogContent>
    </Dialog>
  );
}
