import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Gift, Lock, Trophy, Users, Sparkles } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";

const SEEN_KEY = "csse:bonus-slots-popup:v1";

/**
 * Guest-facing launch-bonus popup for the landing experience.
 *
 * Slot count is read from the trusted server campaign status and refreshed on
 * an interval, so the number visibly ticks down as new users claim slots.
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
  const taken = s.slotsTaken ?? Math.max(0, cap - remaining);
  const amount = s.bonusAmount ?? 100;
  const pct = Math.max(2, Math.min(100, (remaining / Math.max(1, cap)) * 100));

  const dismiss = () => {
    setOpen(false);
    if (typeof window !== "undefined") window.sessionStorage.setItem(SEEN_KEY, "1");
  };

  return (
    <>
      {/* Persistent re-open pill so the offer is never lost after dismissing */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-3 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--color-neon)]/40 bg-[var(--color-surface-2)]/95 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-neon)] shadow-[0_0_24px_var(--color-neon-glow)] backdrop-blur md:bottom-6"
      >
        <Gift className="h-3.5 w-3.5" />
        <span className="tabular-nums">
          <AnimatedBalance value={remaining} maximumFractionDigits={0} /> slots left
        </span>
      </button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
        <StencilDialogContent
          kicker="Launch bonus"
          title={
            <span>
              {amount} free points —{" "}
              <span className="text-[var(--color-neon)]">
                <AnimatedBalance value={remaining} maximumFractionDigits={0} />
              </span>{" "}
              slots left
            </span>
          }
          description="Every existing member gets it. So do the next 100 new sign-ups — first come, first served."
          size="md"
          footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button
                asChild
                className="h-11 flex-1 rounded-full bg-[var(--color-neon)] text-[11px] font-bold uppercase tracking-[0.22em] text-black hover:brightness-110"
              >
                <Link to="/register" onClick={dismiss}>
                  Claim my {amount} points
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 flex-1 rounded-full text-[11px] font-bold uppercase tracking-[0.22em]"
              >
                <Link to="/auth" onClick={dismiss}>
                  I already have an account
                </Link>
              </Button>
            </div>
          }
        >
          <div className="space-y-4 px-5 pb-4 sm:px-6">
            {/* Live slot meter */}
            <div className="rounded-xl border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
              <div className="flex items-end justify-between">
                <div className="font-display text-3xl font-black leading-none tabular-nums text-[var(--color-neon)]">
                  <AnimatedBalance value={remaining} maximumFractionDigits={0} />
                </div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                  of {cap} new-user slots
                </div>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[var(--color-surface-border)]">
                <div
                  className="h-full rounded-full bg-[var(--color-neon)] shadow-[0_0_16px_var(--color-neon-glow)] transition-[width] duration-700 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--color-ink-muted)]">
                <Sparkles className="h-3 w-3 text-[var(--color-neon)]" />
                {taken} already claimed · counter updates live
              </div>
            </div>

            {/* Who gets it */}
            <div className="grid gap-2 sm:grid-cols-2">
              <Perk
                Icon={Users}
                title="Existing members"
                body={`Sign in once and ${amount} points land in your wallet automatically. One time per account.`}
              />
              <Perk
                Icon={Gift}
                title="Next 100 sign-ups"
                body={`Create an account while slots remain and your ${amount} points are reserved instantly.`}
              />
            </div>

            {/* Rules */}
            <div className="rounded-xl border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                <Lock className="h-3 w-3" /> How the bonus works
              </div>
              <ul className="space-y-1.5 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">
                <li>
                  • The {amount} bonus points are <span className="text-[var(--color-ink)]">locked</span>: they can be
                  wagered on any sport or arcade game, but never withdrawn or transferred.
                </li>
                <li>
                  • Lose a bonus wager and the stake is gone. Win, and the{" "}
                  <span className="text-[var(--color-ink)]">profit is fully withdrawable</span> — the bonus principal
                  stays locked.
                </li>
                <li>
                  • Withdrawals need at least{" "}
                  <span className="text-[var(--color-ink)]">100 withdrawable points and 200 total</span> in your wallet.
                </li>
                <li>• One bonus per person. Demo/guest accounts and staff accounts are not eligible.</li>
                <li>• Slots are handed out in order and the cap is enforced server-side — when it hits 0, it's over.</li>
              </ul>
              <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--color-ink-muted)]">
                <Trophy className="h-3 w-3 text-[var(--color-neon)]" />
                Full terms on the{" "}
                <Link to="/faq" onClick={dismiss} className="text-[var(--color-neon)] hover:underline">
                  Help page
                </Link>
                .
              </div>
            </div>
          </div>
        </StencilDialogContent>
      </Dialog>
    </>
  );
}

function Perk({
  Icon,
  title,
  body,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-surface-border)] bg-[#070D0A] p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-neon)]">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-ink-muted)]">{body}</p>
    </div>
  );
}
