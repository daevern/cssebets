import { Dialog, DialogPortal, DialogOverlay } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, AnimatePresence } from "framer-motion";
import { CsseLogo } from "@/components/brand/CsseMark";
import { X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { teamFlagUrl } from "@/lib/country-flags";

export type WinTicketData = {
  id: string;
  matchLabel: string;
  homeTeam?: string;
  awayTeam?: string;
  marketLabel: string;
  selectionLabel: string;
  odds: number;
  stake: number;
  gross: number;
  profit: number;
  settledAt: string;
};

export function WinTicketModal({
  open,
  onOpenChange,
  data,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: WinTicketData | null;
}) {
  const home = data?.homeTeam ?? data?.matchLabel.split(" vs ")[0] ?? "";
  const away = data?.awayTeam ?? data?.matchLabel.split(" vs ")[1] ?? "";
  const ticketId = data ? String(data.id).replace(/-/g, "").slice(0, 10).toUpperCase() : "";
  const kickoffLabel = data
    ? new Date(data.settledAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="backdrop-blur-md" />
        <AnimatePresence>
          {open && data && (
            <DialogPrimitive.Content asChild forceMount>
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-24px)] max-w-[400px] -translate-x-1/2 -translate-y-1/2"
              >
                <DialogPrimitive.Close
                  className="absolute -top-10 right-0 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/40 text-white/80 backdrop-blur transition-colors hover:text-white"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </DialogPrimitive.Close>

                {/* Ticket — matches Picks/PredictionRow styling */}
                <div className="relative overflow-hidden rounded-2xl border border-[var(--color-neon)]/60 bg-[var(--color-surface)] shadow-[0_0_0_1px_rgba(34,224,107,0.15),0_20px_60px_-20px_rgba(34,224,107,0.35)]">
                  {/* Congrats header with logo */}
                  <div className="flex flex-col items-center gap-2 border-b border-dashed border-[var(--color-surface-border)] bg-gradient-to-b from-[var(--color-neon)]/[0.08] to-transparent px-5 pb-4 pt-5 text-center">
                    <CsseLogo size={22} />
                    <DialogPrimitive.Title className="font-display text-[22px] font-bold leading-tight tracking-tight text-[var(--color-ink)]">
                      Congratulations!
                    </DialogPrimitive.Title>
                    <DialogPrimitive.Description className="text-[12px] text-[var(--color-ink-muted)]">
                      Your ticket cashed in profit.
                    </DialogPrimitive.Description>
                  </div>

                  {/* Ticket body */}
                  <div className="space-y-4 px-5 pb-5 pt-4">
                    {/* Kicker row */}
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon)]" />
                        Match Ticket
                      </span>
                      <span>#{ticketId}</span>
                    </div>

                    {/* Fixture */}
                    <div>
                      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">Fixture</div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <div className="flex flex-col items-center gap-1.5">
                          <TeamFlag name={home} />
                          <span className="max-w-[110px] truncate text-center text-[10px] font-bold uppercase tracking-wide">{home}</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <span className="font-display text-xs font-bold leading-none text-[var(--color-ink-muted)]">vs</span>
                          <span className="h-4 w-px bg-[var(--color-neon)]/40" />
                        </div>
                        <div className="flex flex-col items-center gap-1.5">
                          <TeamFlag name={away} />
                          <span className="max-w-[110px] truncate text-center text-[10px] font-bold uppercase tracking-wide">{away}</span>
                        </div>
                      </div>
                      <div className="mt-2 text-[11px] text-[var(--color-ink-muted)]">{kickoffLabel}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Market</div>
                        <div className="truncate font-medium">{data.marketLabel}</div>
                      </div>
                      <div className="border border-dashed border-[var(--color-surface-border)] px-2.5 py-1.5">
                        <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">Selection</div>
                        <div className="truncate font-medium">{data.selectionLabel}</div>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-[var(--color-surface-border)]" />

                    {/* PROMO DISPLAY OVERRIDE — hardcoded stake/payout for Instagram screenshot. Backend values are untouched. */}
                    {(() => {
                      const promoStake = 1000;
                      const promoGross = 3880;
                      const promoProfit = promoGross - promoStake;
                      return (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">Stake</div>
                            <div className="font-mono font-semibold tabular-nums">{promoStake.toFixed(2)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">Odds</div>
                            <div className="font-mono font-semibold tabular-nums">{data.odds.toFixed(2)}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">Payout</div>
                            <div className="font-mono text-lg font-bold leading-tight tabular-nums text-[var(--color-neon)]">
                              {promoGross.toFixed(2)}
                            </div>
                            <div className="text-[10px] tabular-nums text-[var(--color-ink-muted)]">+{promoProfit.toFixed(2)} profit</div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center justify-between gap-2 border-t border-dashed border-[var(--color-surface-border)] pt-3">
                      <span className="rounded-full border border-[var(--color-neon)]/60 bg-[var(--color-neon)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-neon)]">
                        Won
                      </span>
                      <div className="flex items-center gap-2">
                        <Link
                          to="/my-predictions"
                          onClick={() => onOpenChange(false)}
                          className="rounded-lg border border-[var(--color-surface-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)]/40 hover:text-[var(--color-neon)]"
                        >
                          View picks
                        </Link>
                        <button
                          onClick={() => onOpenChange(false)}
                          className="rounded-lg bg-[var(--color-neon)] px-3 py-1.5 text-[11px] font-bold text-[#04140A]"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </DialogPrimitive.Content>
          )}
        </AnimatePresence>
      </DialogPortal>
    </Dialog>
  );
}

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <div className="grid h-9 w-14 place-items-center border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-9 w-14 shrink-0 border border-border/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}
