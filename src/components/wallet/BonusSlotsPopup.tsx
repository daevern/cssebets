import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";
import { Flame, Gift, Users, Zap } from "lucide-react";

const SEEN_KEY = "csse:bonus-slots-popup:v1";

/**
 * Guest-facing launch-bonus sheet with heavy FOMO.
 *
 * Slot count comes from the trusted server campaign status and refreshes on an
 * interval, so the number ticks down live as new accounts claim their slot.
 */
export function BonusSlotsPopup() {
  const fn = useServerFn(getCampaignStatus);
  const [open, setOpen] = useState(false);
  const [claimFlash, setClaimFlash] = useState(false);
  const prevRemainingRef = useRef<number | null>(null);

  const q = useQuery({
    queryKey: ["bonus-campaign-status", "landing"],
    queryFn: () => fn() as Promise<CampaignStatus>,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const s = q.data;
  const live = !!s?.active && (s.slotsRemaining ?? 0) > 0;

  const cap = s?.cap ?? 100;
  const remaining = s?.slotsRemaining ?? 0;
  const taken = s?.slotsTaken ?? Math.max(0, cap - remaining);
  const amount = s?.bonusAmount ?? 100;
  const pct = Math.max(1.5, Math.min(100, (remaining / Math.max(1, cap)) * 100));
  const scarcity = 100 - pct; // % claimed

  useEffect(() => {
    if (prevRemainingRef.current !== null && remaining < prevRemainingRef.current) {
      setClaimFlash(true);
      const t = setTimeout(() => setClaimFlash(false), 2200);
      return () => clearTimeout(t);
    }
    prevRemainingRef.current = remaining;
  }, [remaining]);

  useEffect(() => {
    if (!live) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SEEN_KEY)) return;
    const t = setTimeout(() => setOpen(true), 700);
    return () => clearTimeout(t);
  }, [live]);

  if (!live || !s) return null;

  const dismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SEEN_KEY, "1");
  };

  const urgencyLabel =
    remaining <= 10 ? "Almost gone" : remaining <= 25 ? "Filling fast" : "Live now";

  return (
    <>
      {/* Re-entry pill — sticky, glowing, impossible to miss */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--color-neon)]/30 bg-[var(--color-surface-2)]/95 py-1.5 pl-2 pr-3 text-[11px] font-bold tracking-tight text-[var(--color-ink)] shadow-[0_0_18px_rgba(var(--neon-glow-rgb),0.18)] backdrop-blur-xl transition-all hover:scale-105 hover:border-[var(--color-neon)]/60 hover:shadow-[0_0_26px_rgba(var(--neon-glow-rgb),0.28)] md:bottom-6"
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-[bonus-live-dot_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-neon)] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-neon)]" />
        </span>
        <Flame className="h-3 w-3 text-[var(--color-neon)]" />
        <span className="tabular-nums text-[var(--color-neon)]">
          <AnimatedBalance value={remaining} maximumFractionDigits={0} />
        </span>
        <span className="text-[var(--color-ink-muted)]">bonus slots left</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
        <StencilDialogContent
          kicker="Launch bonus"
          title={`${amount} points, on the house`}
          description="Free for every existing member, and for the next 100 accounts created."
          size="md"
          footer={
            <div className="flex w-full flex-col gap-3">
              <Button
                asChild
                className="bonus-shimmer-button relative h-12 w-full overflow-hidden rounded-full bg-[var(--color-neon)] px-6 text-[13px] font-bold tracking-tight text-black transition-transform hover:scale-[1.02] active:scale-[0.98]"
              >
                <Link to="/register" onClick={dismiss} className="flex items-center justify-center gap-2">
                  <Zap className="h-4 w-4 fill-current" />
                  Claim {amount} points now
                </Link>
              </Button>
              <div className="flex items-center justify-between">
                <Link
                  to="/auth"
                  onClick={dismiss}
                  className="text-[12px] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  I have an account
                </Link>
                <span className="text-[11px] text-[var(--color-ink-dim)]">
                  No deposit required
                </span>
              </div>
            </div>
          }
        >
          <div className="-mx-5 sm:-mx-6">
            {/* Live counter block */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[var(--color-neon)]/[0.06] to-transparent px-5 pb-6 pt-5 sm:px-6">
              {/* ambient glow */}
              <div
                className="pointer-events-none absolute -top-10 left-1/2 h-40 w-64 -translate-x-1/2 opacity-50 blur-3xl"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(var(--neon-glow-rgb),0.22), transparent 70%)",
                }}
              />

              <div className="relative flex items-end justify-between">
                <div className="space-y-1">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-neon)]/25 bg-[var(--color-neon)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-neon)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)] animate-[bonus-live-dot_1.4s_ease-in-out_infinite]" />
                    {urgencyLabel}
                  </span>
                  <p className="text-[11px] font-medium text-[var(--color-ink-muted)]">
                    Slots remaining
                  </p>
                </div>
                <div className="text-right">
                  <span className="font-display text-[44px] font-bold leading-none tracking-tight tabular-nums text-[var(--color-ink)] sm:text-[52px]">
                    <AnimatedBalance value={remaining} maximumFractionDigits={0} />
                  </span>
                  <span className="ml-1 text-[14px] font-medium text-[var(--color-ink-muted)]">
                    / {cap}
                  </span>
                </div>
              </div>

              {/* Scarcity progress bar */}
              <div className="relative mt-4 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${scarcity}%`,
                    background:
                      scarcity > 75
                        ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                        : scarcity > 40
                          ? "linear-gradient(90deg, var(--neon), #f59e0b)"
                          : "linear-gradient(90deg, var(--neon), #4ade80)",
                    boxShadow:
                      scarcity > 75
                        ? "0 0 14px rgba(239,68,68,0.45)"
                        : "0 0 14px rgba(34,224,107,0.35)",
                  }}
                />
                {scarcity > 85 && (
                  <div className="absolute inset-0 animate-[bonus-scarcity-bar_2s_linear_infinite] rounded-full bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px]">
                <span className="font-medium text-[var(--color-ink-muted)]">
                  {taken > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {taken.toLocaleString()} already claimed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Gift className="h-3 w-3" />
                      Be the first to claim
                    </span>
                  )}
                </span>
                <span
                  className={`font-bold tabular-nums transition-colors ${
                    scarcity > 75 ? "text-[var(--neon-red)]" : "text-[var(--color-neon)]"
                  }`}
                >
                  {Math.round(scarcity)}% claimed
                </span>
              </div>

              {/* "Someone just claimed" flash */}
              {claimFlash && (
                <div className="absolute inset-x-0 top-2 flex justify-center">
                  <span className="animate-[bonus-claim-flash_2.2s_ease-in-out_forwards] rounded-full border border-[var(--color-neon)]/30 bg-[var(--color-surface-2)]/95 px-3 py-1 text-[11px] font-bold text-[var(--color-neon)] shadow-lg backdrop-blur">
                    🔥 Someone just claimed a slot
                  </span>
                </div>
              )}
            </div>

            <Row label="Existing members" value={`+${amount} on next sign-in`} />
            <Row label="New accounts" value="Reserved at sign-up" />
            <Row label="Bonus points" value="Wager anywhere · not withdrawable" />
            <Row label="If you win" value="Profit withdrawable, stake stays locked" />
            <Row label="Cash out" value="100 withdrawable · 200 total minimum" />
            <Row label="Eligibility" value="One per person · no demo or staff" />

            <p className="px-5 pt-4 text-[11px] leading-relaxed text-[var(--color-ink-muted)] sm:px-6">
              Slots are allocated in order and enforced on our servers.{" "}
              <Link to="/faq" onClick={dismiss} className="text-[var(--color-ink)] underline-offset-4 hover:underline">
                Full terms
              </Link>
            </p>
          </div>
        </StencilDialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-[var(--color-surface-border)]/60 px-5 py-3 sm:px-6">
      <span className="shrink-0 text-[12.5px] text-[var(--color-ink-muted)]">{label}</span>
      <span className="text-right text-[12.5px] font-medium tracking-tight text-[var(--color-ink)]">{value}</span>
    </div>
  );
}
