import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StencilDialogContent } from "@/components/wallet/StencilDialog";
import { AnimatedBalance } from "@/components/AnimatedBalance";
import { getCampaignStatus, type CampaignStatus } from "@/lib/bonus.functions";
import { Gift, Users, Zap, Ticket } from "lucide-react";

const SEEN_KEY = "csse:bonus-slots-popup:v1";

/**
 * Guest-facing launch-bonus countdown with heavy FOMO.
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
    retry: 2,
    retryDelay: 400,
  });

  const s = q.data;
  const live = !!s?.active && (s.slotsRemaining ?? 0) > 0;

  const remaining = s?.slotsRemaining ?? 0;
  const taken = s?.slotsTaken ?? 0;
  const amount = s?.bonusAmount ?? 100;
  const scarcity = Math.max(0, Math.min(100, (taken / Math.max(1, remaining + taken)) * 100));

  // Urgency tier drives colour, pulse and copy.
  const urgency =
    remaining <= 10 ? "critical" : remaining <= 25 ? "hot" : remaining <= 50 ? "warm" : "fresh";

  const urgencyLabel =
    urgency === "critical"
      ? "Almost gone"
      : urgency === "hot"
        ? "Filling fast"
        : urgency === "warm"
          ? "Going quick"
          : "Live now";

  const glowColor =
    urgency === "critical"
      ? "239, 68, 68"
      : urgency === "hot"
        ? "245, 158, 11"
        : urgency === "warm"
          ? "250, 204, 21"
          : "34, 224, 107";

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

  return (
    <>
      {/* Inline fixture-style countdown card */}
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
        className="group relative block cursor-pointer overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] text-left transition-colors hover:border-[var(--neon)]/40 next-fixture-corner"
      >
        {/* Animated top edge glow — intensifies as slots run out */}
        <div
          className="absolute inset-x-0 top-0 h-[2px] transition-all duration-500"
          style={{
            background: `linear-gradient(90deg, transparent, rgb(${glowColor}), transparent)`,
            opacity: urgency === "critical" ? 1 : urgency === "hot" ? 0.85 : 0.6,
            boxShadow: `0 0 ${urgency === "critical" ? 20 : urgency === "hot" ? 14 : 8}px rgb(${glowColor})`,
          }}
        />

        <div className="relative p-4">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className="flex items-center gap-1.5 text-[var(--ink-muted)]">
              <span className="relative flex h-2 w-2">
                <span
                  className="absolute inline-flex h-full w-full animate-[bonus-live-dot_1.4s_ease-in-out_infinite] rounded-full bg-[var(--color-neon)] opacity-75"
                  style={{ background: `rgb(${glowColor})` }}
                />
                <span
                  className="relative inline-flex h-2 w-2 rounded-full"
                  style={{ background: `rgb(${glowColor})` }}
                />
              </span>
              {urgencyLabel}
            </span>
            <span className="flex items-center gap-1 text-[var(--ink-muted)]">
              <Ticket className="h-3 w-3" />
              Launch bonus
            </span>
          </div>

          {/* Big countdown number */}
          <div className="mt-4 flex items-center gap-4">
            <div
              className="relative grid h-[72px] w-[72px] shrink-0 place-items-center rounded-2xl border transition-all duration-500"
              style={{
                borderColor: `rgba(${glowColor}, 0.45)`,
                background: `radial-gradient(120% 120% at 50% 0%, rgba(${glowColor}, 0.18), rgba(${glowColor}, 0.04) 50%, transparent 70%)`,
                boxShadow: `inset 0 1px 0 rgba(${glowColor}, 0.25), 0 0 ${urgency === "critical" ? 28 : urgency === "hot" ? 18 : 10}px rgba(${glowColor}, 0.18)`,
              }}
            >
              <span
                className={`font-display text-[34px] font-bold leading-none tracking-tighter tabular-nums ${urgency === "critical" ? "animate-[bonus-countdown-pulse_1.1s_ease-in-out_infinite]" : ""}`}
                style={{ color: `rgb(${glowColor})` }}
              >
                <AnimatedBalance value={remaining} maximumFractionDigits={0} />
              </span>
            </div>
            <div className="min-w-0">
              <div className="font-display text-[22px] font-bold leading-none tracking-tight text-[var(--ink)]">
                {amount} points left
              </div>
              <p className="mt-1 text-[12px] leading-snug text-[var(--ink-muted)]">
                Free bonus for the next {Math.max(1, remaining)} accounts.
              </p>
            </div>
          </div>

          {/* Depletion bar — remaining slots, not claimed */}
          <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.max(2, 100 - scarcity)}%`,
                background:
                  urgency === "critical"
                    ? "linear-gradient(90deg, #ef4444, #f59e0b)"
                    : urgency === "hot"
                      ? "linear-gradient(90deg, #f59e0b, #facc15)"
                      : urgency === "warm"
                        ? "linear-gradient(90deg, #facc15, var(--neon))"
                        : "linear-gradient(90deg, var(--neon), #4ade80)",
                boxShadow: `0 0 12px rgba(${glowColor}, 0.45)`,
              }}
            />
            {urgency === "critical" && (
              <div className="absolute inset-0 animate-[bonus-scarcity-bar_1.4s_linear_infinite] rounded-full bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1 font-medium text-[var(--ink-muted)]">
              {taken > 0 ? (
                <>
                  <Users className="h-3 w-3" />
                  {taken.toLocaleString()} already claimed
                </>
              ) : (
                <>
                  <Gift className="h-3 w-3" />
                  Be the first to claim
                </>
              )}
            </span>
            <span
              className="font-bold tabular-nums"
              style={{ color: `rgb(${glowColor})` }}
            >
              {Math.round(scarcity)}% gone
            </span>
          </div>

          <Link
            to="/register"
            onClick={(e) => e.stopPropagation()}
            className="mt-4 flex items-center justify-center gap-2 rounded-xl border border-[var(--neon)]/50 bg-[var(--neon)]/5 py-3.5 text-[14px] font-bold tracking-tight text-[var(--neon)] transition-transform group-hover:translate-y-[-1px] group-hover:bg-[var(--neon)]/10"
          >
            <Zap className="h-4 w-4 fill-current" />
            Claim {amount} points
          </Link>

          <p className="mt-2 text-center text-[10.5px] text-[var(--ink-muted)]">
            Tap the card for full bonus details
          </p>
        </div>
      </section>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : dismiss())}>
        <StencilDialogContent
          kicker="Launch bonus"
          title={`${amount} points, on the house`}
          description="Free for every existing member, and for the next accounts created."
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
                  background: `radial-gradient(closest-side, rgba(${glowColor}, 0.22), transparent 70%)`,
                }}
              />

              <div className="relative flex flex-col items-center text-center">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    borderColor: `rgba(${glowColor}, 0.35)`,
                    background: `rgba(${glowColor}, 0.10)`,
                    color: `rgb(${glowColor})`,
                  }}
                >
                  <span
                    className="h-1.5 w-1.5 animate-[bonus-live-dot_1.4s_ease-in-out_infinite] rounded-full"
                    style={{ background: `rgb(${glowColor})` }}
                  />
                  {urgencyLabel}
                </span>

                {/* Hero countdown orb */}
                <div
                  className="relative mt-5 grid h-[140px] w-[140px] place-items-center rounded-full border-2"
                  style={{
                    borderColor: `rgba(${glowColor}, 0.35)`,
                    background: `conic-gradient(rgba(${glowColor}, 0.22) ${(100 - scarcity) * 3.6}deg, transparent 0deg), radial-gradient(circle at 50% 0%, rgba(${glowColor}, 0.12), transparent 60%)`,
                    boxShadow: `inset 0 0 40px rgba(${glowColor}, 0.10), 0 0 ${urgency === "critical" ? 40 : 24}px rgba(${glowColor}, 0.15)`,
                  }}
                >
                  <div className="flex flex-col items-center leading-none">
                    <span
                      className={`font-display text-[56px] font-bold tracking-tighter tabular-nums text-[var(--color-ink)] sm:text-[64px] ${urgency === "critical" ? "animate-[bonus-countdown-pulse_1.1s_ease-in-out_infinite]" : ""}`}
                    >
                      <AnimatedBalance value={remaining} maximumFractionDigits={0} />
                    </span>
                    <span className="mt-1 text-[13px] font-semibold uppercase tracking-widest text-[var(--color-ink-muted)]">
                      left
                    </span>
                  </div>
                </div>

                <p className="mt-3 text-[13px] font-medium text-[var(--color-ink)]">
                  {amount} free points for the next {Math.max(1, remaining)} accounts
                </p>
              </div>

              {/* Depletion bar */}
              <div className="relative mt-5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${Math.max(2, 100 - scarcity)}%`,
                    background:
                      urgency === "critical"
                        ? "linear-gradient(90deg, #ef4444, #f59e0b)"
                        : urgency === "hot"
                          ? "linear-gradient(90deg, #f59e0b, #facc15)"
                          : urgency === "warm"
                            ? "linear-gradient(90deg, #facc15, var(--neon))"
                            : "linear-gradient(90deg, var(--neon), #4ade80)",
                    boxShadow: `0 0 14px rgba(${glowColor}, 0.45)`,
                  }}
                />
                {urgency === "critical" && (
                  <div className="absolute inset-0 animate-[bonus-scarcity-bar_1.4s_linear_infinite] rounded-full bg-[length:200%_100%] bg-gradient-to-r from-transparent via-white/25 to-transparent" />
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
                <span className="font-bold tabular-nums" style={{ color: `rgb(${glowColor})` }}>
                  {Math.round(scarcity)}% gone
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
              Bonuses are allocated in order and enforced on our servers.{" "}
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
