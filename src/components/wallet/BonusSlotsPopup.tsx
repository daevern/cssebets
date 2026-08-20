import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";

const SEEN_KEY = "csse:bonus-slots-popup:v1";

/**
 * Guest-facing launch-bonus sheet.
 *
 * Slot count comes from the trusted server campaign status and refreshes on an
 * interval, so the number ticks down live as new accounts claim their slot.
 */
export function BonusSlotsPopup() {
  const fn = useServerFn(getCampaignStatus);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["bonus-campaign-status", "landing"],
    queryFn: () => fn() as Promise<CampaignStatus>,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const s = q.data;
  const live = !!s?.active && (s.slotsRemaining ?? 0) > 0;

  useEffect(() => {
    if (!live) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SEEN_KEY)) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [live]);

  if (!live || !s) return null;

  const cap = s.cap ?? 100;
  const remaining = s.slotsRemaining ?? 0;
  const amount = s.bonusAmount ?? 100;
  const pct = Math.max(1.5, Math.min(100, (remaining / Math.max(1, cap)) * 100));

  const dismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SEEN_KEY, "1");
  };

  return (
    <>
      {/* Quiet re-entry affordance — a ledger tag, not a marketing bubble */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/90 py-1.5 pl-2.5 pr-3 text-[11px] font-medium text-[var(--color-ink-muted)] backdrop-blur-xl transition-colors hover:text-[var(--color-ink)] md:bottom-6"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
        <span className="tabular-nums">
          <AnimatedBalance value={remaining} maximumFractionDigits={0} /> bonus slots left
        </span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
        <StencilDialogContent
          kicker="Launch bonus"
          title={`${amount} points, on the house`}
          description="Free for every existing member, and for the next 100 accounts created."
          size="md"
          footer={
            <div className="flex w-full items-center justify-between gap-3">
              <Link
                to="/auth"
                onClick={dismiss}
                className="text-[12px] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
              >
                I have an account
              </Link>
              <Button
                asChild
                className="h-10 rounded-full bg-[var(--color-neon)] px-6 text-[12px] font-semibold tracking-tight text-black hover:brightness-110"
              >
                <Link to="/register" onClick={dismiss}>
                  Claim {amount} points
                </Link>
              </Button>
            </div>
          }
        >
          <div className="-mx-5 sm:-mx-6">
            {/* Live counter */}
            <div className="px-5 pb-5 sm:px-6">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Slots remaining</span>
                <span className="font-display text-[34px] font-semibold leading-none tracking-tight tabular-nums text-[var(--color-ink)]">
                  <AnimatedBalance value={remaining} maximumFractionDigits={0} />
                  <span className="ml-1 text-[15px] font-normal text-[var(--color-ink-muted)]">/ {cap}</span>
                </span>
              </div>
              <div className="mt-3 h-px w-full bg-[var(--color-surface-border)]">
                <div
                  className="h-px bg-[var(--color-neon)] transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
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
