import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Dialog } from "@/components/ui/dialog";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";

const SEEN_KEY = "csse:bonus-slots-popup:v1";

/** Hairline chevron — the only glyph in the component. */
function Chevron({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className={className} fill="none">
      <path
        d="M4.5 2.5 8 6l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Launch-bonus card + detail sheet.
 *
 * Deliberately restrained: one accent colour, one number, generous whitespace,
 * hairline rules instead of boxes. Slot count is server-trusted and refreshes
 * on an interval.
 */
export function BonusSlotsPopup() {
  const fn = useServerFn(getCampaignStatus);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    queryKey: ["bonus-campaign-status", "landing"],
    queryFn: () => fn() as Promise<CampaignStatus>,
    staleTime: 10_000,
    refetchInterval: 15_000,
    retry: 2,
    retryDelay: 400,
  });

  const s = q.data;
  const live = !!s?.active && (s.slotsRemaining ?? 0) > 0;
  const remaining = s?.slotsRemaining ?? 0;
  const amount = s?.bonusAmount ?? 100;

  useEffect(() => {
    if (!live) return;
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(SEEN_KEY)) return;
    const t = setTimeout(() => setOpen(true), 900);
    return () => clearTimeout(t);
  }, [live]);

  if (!live || !s) return null;

  const dismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SEEN_KEY, "1");
  };

  return (
    <>
      <section
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="bonus-card-shimmer group relative block cursor-pointer overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] text-left transition-colors hover:border-[var(--neon)]/30"
      >
        <div className="px-5 py-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Launch bonus
          </div>

          <div className="mt-4">
            <div className="font-display text-[40px] font-semibold leading-none tracking-tight text-[var(--ink)]">
              {amount}
              <span className="ml-1.5 align-baseline text-[15px] font-medium text-[var(--ink-muted)]">
                points
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-snug text-[var(--ink-muted)]">
              Free on your first account. No deposit.
            </p>
          </div>

          <div className="mt-5 h-px w-full bg-[var(--color-surface-border)]" />

          <div className="mt-4 flex items-center justify-between">
            <Link
              to="/register"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold tracking-tight text-[var(--neon)] transition-opacity hover:opacity-80"
            >
              Claim bonus
              <Chevron className="h-3 w-3" />
            </Link>
            <span className="text-[11px] text-[var(--ink-muted)]">Details</span>
          </div>
        </div>
      </section>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
        <StencilDialogContent
          kicker="Launch bonus"
          title={`${amount} points, on the house`}
          description="Limited launch offer — claim while it lasts."
          size="md"
          footer={
            <div className="flex w-full flex-col gap-3">
              <Link
                to="/register"
                onClick={dismiss}
                className="inline-flex h-12 w-full items-center justify-center rounded-full bg-[var(--color-neon)] text-[14px] font-semibold tracking-tight text-black transition-transform active:scale-[0.98]"
              >
                Claim {amount} points
              </Link>
              <div className="flex items-center justify-between">
                <Link
                  to="/auth"
                  onClick={dismiss}
                  className="text-[12px] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  I have an account
                </Link>
                <span className="text-[11px] text-[var(--color-ink-dim)]">No deposit required</span>
              </div>
            </div>
          }
        >
          <div className="-mx-5 sm:-mx-6">
            <Row label="Existing members" value={`+${amount} on next sign-in`} />
            <Row label="New accounts" value="Reserved at sign-up" />
            <Row label="Bonus points" value="Wager anywhere · not withdrawable" />
            <Row label="If you win" value="Profit withdrawable" />
            <Row label="Cash out" value="100 withdrawable · 200 total min" />
            <Row label="Eligibility" value="One per person" />

            <p className="px-5 pt-4 text-[11px] leading-relaxed text-[var(--color-ink-muted)] sm:px-6">
              Allocated in order and enforced on our servers.{" "}
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
