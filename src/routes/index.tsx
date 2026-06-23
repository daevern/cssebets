import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  FeaturedMatches,
  useLandingData,
} from "@/components/HeroEnhancements";
import {
  CommunityGrowthSection,
  RecentPlatformActivity,
  PayoutPerformanceSection,
  BuildingLongRun,
} from "@/components/landing/TrustSections";
import { recordHomeView } from "@/lib/trust-public.functions";
import { useServerFn } from "@tanstack/react-start";
const HowItWorks = lazy(() =>
  import("@/components/HowItWorks").then((m) => ({ default: m.HowItWorks })),
);

import { Mail, MessageCircle, ArrowRight, Radio, Lock } from "lucide-react";
import { CsseLogo } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "cssebets — Predict, Bet & Cash Out on FIFA World Cup" },
      {
        name: "description",
        content:
          "Predict World Cup matches, place bets using points, track results, and cash out your winnings on cssebets.",
      },
      { property: "og:title", content: "cssebets — Competitive Strategy Starts Everywhere" },
      {
        property: "og:description",
        content:
          "Convert cash for points and start placing bets on FIFA World Cup matches.",
      },
    ],
  }),
  component: LandingPage,
});

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Tick-mark corners — same as dashboard fixture card. */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

/* Stencil digit cell — mirrors dashboard countdown chrome. */
function DigitCell({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className="relative grid h-12 w-10 place-items-center overflow-hidden border border-[var(--color-surface-border)] bg-[#070D0A] sm:h-14 sm:w-12">
        <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-[var(--color-neon)]/15" />
        <span className="font-display text-[24px] font-bold leading-none tabular-nums text-[var(--color-ink)] sm:text-[28px]">
          {value}
        </span>
      </div>
      <span className="mt-1 text-[8px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        {label}
      </span>
    </div>
  );
}

function LockdownClock({ kickoff }: { kickoff: string | null }) {
  const target = useMemo(() => {
    if (kickoff) return new Date(kickoff).getTime();
    return Date.now() + 6 * 60 * 60 * 1000;
  }, [kickoff]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (x: number) => x.toString().padStart(2, "0");
  return (
    <span className="font-display font-bold tabular-nums text-[var(--color-neon)]">
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

function LockdownClockBig({ kickoff }: { kickoff: string | null }) {
  const target = useMemo(() => {
    if (kickoff) return new Date(kickoff).getTime();
    return Date.now() + 6 * 60 * 60 * 1000;
  }, [kickoff]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (x: number) => x.toString().padStart(2, "0");
  return (
    <div className="flex items-end justify-center gap-1.5">
      <DigitCell value={pad(h)} label="Hours" />
      <span className="pb-5 font-display text-xl font-bold text-[var(--color-neon)]">:</span>
      <DigitCell value={pad(m)} label="Min" />
      <span className="pb-5 font-display text-xl font-bold text-[var(--color-neon)]">:</span>
      <DigitCell value={pad(s)} label="Sec" />
    </div>
  );
}

/* CSSE primary CTA — neon, sharp, stencil. */
function NeonButton({
  to,
  children,
  href,
}: {
  to?: string;
  href?: string;
  children: React.ReactNode;
}) {
  const cls =
    "group inline-flex items-center justify-center gap-2 border border-[var(--color-neon)] bg-[var(--color-neon)] px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_24px_rgba(34,224,107,0.45)]";
  if (href)
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  return (
    <Link to={to!} className={cls}>
      {children}
    </Link>
  );
}

function GhostButton({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center gap-2 border border-[var(--color-surface-border)] bg-transparent px-5 py-3 font-display text-sm font-bold uppercase tracking-[0.28em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
    >
      {children}
    </Link>
  );
}

function LandingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const landing = useLandingData();
  const trackView = useServerFn(recordHomeView);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthed(!!data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    trackView({}).catch(() => {});
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [trackView]);

  const primaryCta = authed
    ? { to: "/dashboard", label: "Go to Dashboard" }
    : { to: "/auth", label: "Sign In / Register" };

  const kickoff = landing?.nextMatches?.[0]?.kickoffAt ?? null;

  return (
    <div className="relative min-h-screen scroll-smooth bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard scanline — same as dashboard */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />

      {/* Matchday status bar — stencil */}
      <div className="sticky top-0 z-50 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em]">
          <div className="flex min-w-0 items-center gap-2 truncate text-[var(--color-ink-muted)]">
            <Lock className="h-3 w-3 shrink-0 text-[var(--color-neon)]" />
            <span className="truncate">
              Lines lock in <LockdownClock kickoff={kickoff} />
            </span>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            <Radio className="h-3 w-3 text-[var(--color-neon)]" />
            <span className="text-[var(--color-neon)]">Matchday · Live</span>
          </div>
        </div>
      </div>

      {/* Top nav — sharp, stencil */}
      <header className="sticky top-[28px] z-40 border-b border-[var(--color-surface-border)] bg-[var(--color-surface)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="CSSEBets home">
            <CsseLogo size={18} />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => scrollToId("how")}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-neon)]"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToId("support")}
              className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-neon)]"
            >
              Support
            </button>
          </nav>

          {authed ? (
            <Link
              to="/dashboard"
              className="border border-[var(--color-neon)] bg-[var(--color-neon)] px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
            >
              Dashboard
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/auth"
                className="hidden border border-[var(--color-surface-border)] px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)] sm:inline-flex"
              >
                Log in
              </Link>
              <Link
                to="/register"
                className="border border-[var(--color-neon)] bg-[var(--color-neon)] px-3 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Neon stadium wash */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.16), transparent 60%), repeating-linear-gradient(90deg, transparent 0 60px, rgba(34,224,107,0.04) 60px 61px)",
          }}
        />

        {/* Live odds ticker — stencil */}
        {(landing?.nextMatches?.length ?? 0) > 0 && (
          <div className="relative border-b border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/80 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-hidden px-4 py-2">
              <span className="inline-flex items-center gap-1.5 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
                Live Odds
              </span>
              <div className="flex flex-1 gap-6 overflow-x-clip whitespace-nowrap text-[11px] text-[var(--color-ink-muted)] [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
                <div className="flex animate-[ticker_40s_linear_infinite] gap-6 hover:[animation-play-state:paused]">
                  {[...(landing?.nextMatches ?? []), ...(landing?.nextMatches ?? [])].map((m, i) => {
                    if (!m) return null;
                    const fmt = (n: number | null) => (n != null ? n.toFixed(2) : "—");
                    return (
                      <span key={`${m.id}-${i}`} className="inline-flex items-center gap-2">
                        <span className="font-display font-bold uppercase tracking-[0.2em] text-[var(--color-ink)]/85">
                          {m.homeTeam} vs {m.awayTeam}
                        </span>
                        {[m.homeOdds, m.drawOdds, m.awayOdds].map((o, idx) => (
                          <span
                            key={idx}
                            className="border border-[var(--color-surface-border)] bg-[#070D0A] px-1.5 py-0.5 font-display tabular-nums text-[var(--color-ink)] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
                          >
                            {fmt(o)}
                          </span>
                        ))}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 py-12 text-center sm:py-16">
          <div className="inline-flex items-center gap-2 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            FIFA World Cup 2026
          </div>

          <h1 className="mt-6 font-display text-[40px] font-bold leading-[0.95] tracking-tight sm:text-[64px]">
            Be the <span className="text-[var(--color-neon)]">12th man.</span>
            <br />
            <span className="text-[var(--color-ink-muted)]">Predict like the manager.</span>
          </h1>

          <p className="mt-4 max-w-xl font-display text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)] sm:text-xs">
            Competitive Strategy Starts Everywhere
          </p>

          {/* Stencil countdown — kickoff pressure */}
          <div className="relative mt-7 inline-block border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)] px-5 py-4">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
              <Lock className="h-3 w-3 text-[var(--color-neon)]" />
              Next kickoff locks in
            </div>
            <LockdownClockBig kickoff={kickoff} />
          </div>

          {/* Featured matches */}
          <div className="mt-8 w-full max-w-4xl">
            <FeaturedMatches matches={landing?.nextMatches ?? []} authed={authed} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {authed ? (
              <NeonButton to="/dashboard">
                Place your bet
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </NeonButton>
            ) : (
              <>
                <NeonButton to="/register">
                  Join before kickoff
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </NeonButton>
                <GhostButton to="/auth">Log in</GhostButton>
              </>
            )}
          </div>
        </div>

        <style>{`
          @keyframes ticker {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </section>

      {/* dashed seam — matchday paper */}
      <div className="relative border-y border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/40 py-2">
        <div className="mx-auto max-w-6xl px-4 text-center text-[9px] font-bold uppercase tracking-[0.4em] text-[var(--color-ink-muted)]">
          ⎯⎯ Matchday Console ⎯⎯
        </div>
      </div>

      {/* TRUST SECTIONS */}
      <CommunityGrowthSection />
      <RecentPlatformActivity />
      <PayoutPerformanceSection />

      <Suspense fallback={<div className="h-[600px]" />}>
        <HowItWorks />
      </Suspense>

      <BuildingLongRun />

      {/* CONVERSION BELT — stencil */}
      <section className="relative overflow-hidden bg-[var(--color-surface)]">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(50% 80% at 50% 50%, rgba(34,224,107,0.16), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            Don't watch from the sidelines
          </div>
          <h2 className="mt-4 font-display text-[34px] font-bold uppercase leading-[1] tracking-tight sm:text-[56px]">
            Kickoff won't <span className="text-[var(--color-neon)]">wait.</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-[var(--color-ink-muted)] sm:text-base">
            Every minute you wait, someone else takes the value. Lock your position before the whistle.
          </p>

          <div className="relative mt-6 inline-block border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)] px-5 py-4">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
              <Lock className="h-3 w-3 text-[var(--color-neon)]" />
              Bets close in
            </div>
            <LockdownClockBig kickoff={kickoff} />
          </div>

          <div className="mt-6 flex items-center justify-center">
            {authed ? (
              <NeonButton to="/dashboard">
                Place your bet
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </NeonButton>
            ) : (
              <NeonButton to="/register">
                Make a bet
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </NeonButton>
            )}
          </div>
        </div>
      </section>

      {/* SUPPORT — stencil cards */}
      <section id="support" className="border-t border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/40">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-neon)]" />
                Support · 24/7
              </div>
              <h2 className="font-display text-[28px] font-bold uppercase leading-[1] tracking-tight sm:text-[40px]">
                Need <span className="text-[var(--color-neon)]">help?</span>
              </h2>
              <p className="mt-3 text-sm text-[var(--color-ink-muted)]">
                For account access, point requests, or wallet questions — contact cssebets support.
              </p>
              <div className="mt-5">
                <NeonButton href="mailto:support@cssebets.com">
                  <Mail className="h-4 w-4" />
                  Contact support
                </NeonButton>
              </div>
            </div>

            <div className="grid gap-3">
              <a
                href="https://wa.me/601114211004"
                className="relative flex items-center gap-3 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4 transition-colors hover:border-[var(--color-neon)]"
              >
                <Corner pos="tl" />
                <Corner pos="br" />
                <MessageCircle className="h-5 w-5 text-[var(--color-neon)]" />
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                    WhatsApp
                  </div>
                  <div className="font-display text-sm font-bold tabular-nums text-[var(--color-ink)]">
                    +60 11 142 11004
                  </div>
                </div>
              </a>
              <a
                href="mailto:support@cssebets.com"
                className="relative flex items-center gap-3 border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-4 transition-colors hover:border-[var(--color-neon)]"
              >
                <Corner pos="tl" />
                <Corner pos="br" />
                <Mail className="h-5 w-5 text-[var(--color-neon)]" />
                <div>
                  <div className="text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                    Email
                  </div>
                  <div className="font-display text-sm font-bold text-[var(--color-ink)]">
                    support@cssebets.com
                  </div>
                </div>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-[var(--color-surface-border)] bg-[var(--color-surface)] pb-20 sm:pb-8">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CsseLogo size={18} />
            <Link
              to={primaryCta.to}
              className="text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-neon)]"
            >
              {primaryCta.label}
            </Link>
          </div>
          <p className="mt-5 text-xs text-[var(--color-ink-muted)]">
            Convert cash for points and start placing bets. Withdrawals or cashout are processed on this platform.
          </p>
          <p className="mt-2 text-xs text-[var(--color-ink-muted)]">
            © {new Date().getFullYear()} cssebets. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Mobile sticky CTA — stencil */}
      {!authed && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-neon)]/30 bg-[var(--color-surface)]/95 px-3 py-2.5 backdrop-blur-md sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[10px] leading-tight">
              <div className="font-display font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                Bets close in
              </div>
              <LockdownClock kickoff={kickoff} />
            </div>
            <Link
              to="/register"
              className="shrink-0 border border-[var(--color-neon)] bg-[var(--color-neon)] px-3 py-2 font-display text-[10px] font-bold uppercase tracking-[0.28em] text-[#04140A] transition-all hover:shadow-[0_0_18px_rgba(34,224,107,0.45)]"
            >
              Register
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
