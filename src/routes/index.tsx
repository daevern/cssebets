import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FeaturedMatches,
  useLandingData,
} from "@/components/HeroEnhancements";
import {
  CommunityGrowthSection,
  RecentPlatformActivity,
  PayoutPerformanceSection,
  BuildingLongRun,
  TrustCard,
} from "@/components/landing/TrustSections";
import { recordHomeView } from "@/lib/trust-public.functions";
import { useServerFn } from "@tanstack/react-start";
const HowItWorks = lazy(() =>
  import("@/components/HowItWorks").then((m) => ({ default: m.HowItWorks })),
);

import {
  Mail,
  MessageCircle,
  ArrowRight,
  Zap,
  Flame,
  Lock,
} from "lucide-react";
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

// Countdown to next kickoff — pure pressure
function LockdownClock({ kickoff }: { kickoff: string | null }) {
  const target = useMemo(() => {
    if (kickoff) return new Date(kickoff).getTime();
    // fallback: next sunset-ish 6h window so the clock never reads zero
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
    <span className="font-mono font-bold tabular-nums text-primary">
      {pad(h)}:{pad(m)}:{pad(s)}
    </span>
  );
}

function LandingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const landing = useLandingData();

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setAuthed(!!data.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session?.user);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const primaryCta = authed
    ? { to: "/dashboard", label: "Go to Dashboard" }
    : { to: "/auth", label: "Sign In / Register" };

  const kickoff = landing?.nextMatches?.[0]?.kickoffAt ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* FOMO urgency bar — always visible, the heartbeat of the page */}
      <div className="sticky top-0 z-50 border-b border-primary/30 bg-gradient-to-r from-primary/15 via-primary/10 to-primary/15 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-1.5 text-[11px] sm:text-xs">
          <div className="flex items-center gap-2 truncate">
            <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">
              Next match locks in <LockdownClock kickoff={kickoff} />
            </span>
          </div>
          <div className="hidden items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Platform operational
            </span>
          </div>
        </div>
      </div>

      {/* Top nav */}
      <header className="sticky top-[30px] z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="CSSEBets home">
            <CsseLogo size={18} />
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => scrollToId("how")}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              How It Works
            </button>
            <button
              onClick={() => scrollToId("support")}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Support
            </button>
          </nav>
          {authed ? (
            <Link to="/dashboard">
              <Button size="sm" className="shadow-md shadow-primary/30 transition-transform hover:scale-[1.03]">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link to="/auth" className="hidden sm:inline-flex">
                <Button size="sm" variant="ghost" className="transition-colors hover:text-primary">
                  Log In
                </Button>
              </Link>
              <Link to="/register">
                <Button size="sm" className="shadow-md shadow-primary/30 transition-transform hover:scale-[1.03] animate-pulse">
                  Register Now
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* HERO — flows directly into the next sections via shared gradient bg */}
      <section className="relative overflow-hidden">
        {/* Stadium glow backdrop */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent), repeating-linear-gradient(90deg, transparent 0 60px, color-mix(in oklab, var(--primary) 6%, transparent) 60px 61px)",
          }}
        />

        {/* Live odds ticker — pulls actual upcoming matches & reference odds */}
        {(landing?.nextMatches?.length ?? 0) > 0 && (
          <div className="relative border-b border-border/40 bg-card/40 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-hidden px-4 py-2">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live Odds
              </span>
              <div className="flex flex-1 gap-6 overflow-x-clip whitespace-nowrap text-xs text-muted-foreground [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
                <div className="flex animate-[ticker_40s_linear_infinite] gap-6 hover:[animation-play-state:paused]">
                  {[...(landing?.nextMatches ?? []), ...(landing?.nextMatches ?? [])].map((m, i) => {
                    if (!m) return null;
                    const fmt = (n: number | null) => (n != null ? n.toFixed(2) : "—");
                    return (
                      <span key={`${m.id}-${i}`} className="inline-flex items-center gap-2">
                        <span className="font-semibold text-foreground/80">
                          {m.homeTeam} vs {m.awayTeam}
                        </span>
                        {[m.homeOdds, m.drawOdds, m.awayOdds].map((o, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground transition-colors hover:bg-primary/20 hover:text-primary"
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
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Flame className="h-3.5 w-3.5" />
            FIFA WORLD CUP 2026
          </div>

          <h1 className="mt-5 text-4xl font-black uppercase tracking-tight sm:text-6xl">
            Be the <span className="text-primary">12th man</span>.
            <br />
            Predict like the manager.
          </h1>

          <p className="mt-4 max-w-xl text-base font-bold uppercase tracking-wider text-primary/90 sm:text-lg">
            competitive strategy starts everywhere
          </p>


          {/* Featured matches */}
          <div className="mt-6 w-full max-w-4xl">
            <FeaturedMatches matches={landing?.nextMatches ?? []} authed={authed} />
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {authed ? (
              <Link to="/dashboard">
                <Button
                  size="lg"
                  className="group relative gap-2 overflow-hidden font-bold uppercase tracking-wide shadow-lg shadow-primary/40 transition-all hover:scale-[1.03] hover:shadow-primary/60"
                >
                  <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  Place Your Bet
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/register">
                  <Button
                    size="lg"
                    className="group relative gap-2 overflow-hidden font-bold uppercase tracking-wide shadow-lg shadow-primary/40 transition-all hover:scale-[1.03] hover:shadow-primary/60"
                  >
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <Zap className="h-4 w-4" />
                    Join Before Kickoff
                  </Button>
                </Link>
                <Link to="/auth">
                  <Button
                    size="lg"
                    variant="outline"
                    className="font-bold uppercase tracking-wide transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary"
                  >
                    Log In
                  </Button>
                </Link>
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

      {/* Seamless gradient seam — hero into trust sections */}
      <div className="relative h-8 bg-gradient-to-b from-background via-card/30 to-background" />

      {/* SECTION 2: Community Growth — real members, bets, payouts this month */}
      <CommunityGrowthSection />

      {/* SECTION 3: Recent Platform Activity — masked, real events */}
      <RecentPlatformActivity />

      {/* SECTION 4: Payout Performance + improved cashout messaging */}
      <PayoutPerformanceSection />

      {/* SECTION 5: How it works */}
      <Suspense fallback={<div className="h-[600px]" />}>
        <HowItWorks />
      </Suspense>

      {/* Building for the long run */}
      <BuildingLongRun />

      {/* Trust Card — at-a-glance live snapshot */}
      <TrustCard />


      {/* Conversion belt — one last FOMO punch before support */}
      <section className="relative overflow-hidden bg-gradient-to-b from-background to-card/40">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(50% 80% at 50% 50%, color-mix(in oklab, var(--primary) 25%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-3xl px-4 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Flame className="h-3.5 w-3.5" />
            Don't Watch From The Sidelines
          </div>
          <h2 className="mt-4 text-3xl font-black uppercase tracking-tight sm:text-5xl">
            Kickoff Won't <span className="text-primary">Wait</span>.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground sm:text-base">
            Every minute you wait, someone else takes the value. Lock your position before the whistle.
          </p>
          <div className="mt-5 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-card/60 px-4 py-2 text-sm backdrop-blur">
            <Lock className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Bets close in</span>
            <LockdownClock kickoff={kickoff} />
          </div>
          <div className="mt-6 flex items-center justify-center">
            {authed ? (
              <Link to="/dashboard">
                <Button size="lg" className="gap-2 font-bold uppercase tracking-wide shadow-lg shadow-primary/40">
                  Place Your Bet
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Link to="/register">
                <Button size="lg" className="gap-2 font-bold uppercase tracking-wide shadow-lg shadow-primary/40">
                  <Zap className="h-4 w-4" />
                  MAKE A BET
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Support — softened, no harsh border */}
      <section id="support" className="bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <h2 className="text-2xl font-bold sm:text-3xl">Need help?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                For account access, point requests, or wallet questions, contact cssebets support.
              </p>
              <a href="mailto:support@cssebets.com" className="mt-5 inline-block">
                <Button size="lg" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Contact Support
                </Button>
              </a>
            </div>
            <div className="grid gap-3">
              <Card className="flex items-center gap-3 p-4">
                <MessageCircle className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs text-muted-foreground">WhatsApp</div>
                  <div className="font-medium">+60 11 142 11004</div>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <Mail className="h-5 w-5 text-primary" />
                <div>
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a href="mailto:support@cssebets.com" className="font-medium hover:text-primary">
                    support@cssebets.com
                  </a>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background pb-20 sm:pb-8">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <CsseLogo size={18} />

            <Link to={primaryCta.to} className="text-sm text-muted-foreground hover:text-foreground">
              {primaryCta.label}
            </Link>
          </div>
          <p className="mt-5 text-xs text-muted-foreground">
            Convert cash for points and start placing bets. Withdrawals or cashout are processed on this platform.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            © {new Date().getFullYear()} cssebets. All rights reserved.
          </p>
        </div>
      </footer>

      {/* Mobile sticky FOMO CTA — always there, pulsing pressure */}
      {!authed && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-primary/30 bg-background/95 px-3 py-2.5 backdrop-blur-md sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-[11px] leading-tight">
              <div className="font-bold uppercase tracking-wider text-primary">Bets close in</div>
              <LockdownClock kickoff={kickoff} />
            </div>
            <Link to="/register" className="shrink-0">
              <Button size="sm" className="gap-1 font-bold uppercase tracking-wide shadow-lg shadow-primary/40">
                <Zap className="h-3.5 w-3.5" />
                Register Now
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
