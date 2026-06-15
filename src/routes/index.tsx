import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Countdown,
  StatsRow,
  FeaturedMatch,
  TrustBadgesInteractive,
  useLandingData,
} from "@/components/HeroEnhancements";
const HowItWorks = lazy(() =>
  import("@/components/HowItWorks").then((m) => ({ default: m.HowItWorks })),
);

import {
  Trophy,
  Mail,
  MessageCircle,
  ArrowRight,
  Radio,
  Wallet,
  History,
  LifeBuoy,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  Flame,
} from "lucide-react";



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

function LandingPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);

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




  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Trophy className="h-5 w-5 text-primary" />
            <span>cssebets</span>
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
                <Button size="sm" className="shadow-md shadow-primary/30 transition-transform hover:scale-[1.03]">
                  Sign Up
                </Button>
              </Link>
            </div>
          )}
        </div>
      </header>

      {/* Hero — sportsbook style */}
      <section className="relative overflow-hidden border-b border-border">
        {/* Stadium glow backdrop */}
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent), repeating-linear-gradient(90deg, transparent 0 60px, color-mix(in oklab, var(--primary) 6%, transparent) 60px 61px)",
          }}
        />

        {/* Live odds ticker */}
        <div className="relative border-b border-border/60 bg-card/50 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-hidden px-4 py-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
              Live Odds
            </span>
            <div className="flex flex-1 gap-6 overflow-hidden whitespace-nowrap text-xs text-muted-foreground [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
              <div className="flex animate-[ticker_40s_linear_infinite] gap-6">
                {[
                  ["BRA", "ARG", "2.10", "3.40", "2.80"],
                  ["FRA", "GER", "1.95", "3.20", "3.60"],
                  ["ESP", "ITA", "2.45", "3.10", "2.70"],
                  ["ENG", "POR", "2.20", "3.30", "3.00"],
                  ["NED", "BEL", "2.05", "3.25", "3.40"],
                  ["URU", "CRO", "2.60", "3.00", "2.55"],
                ].concat([
                  ["BRA", "ARG", "2.10", "3.40", "2.80"],
                  ["FRA", "GER", "1.95", "3.20", "3.60"],
                  ["ESP", "ITA", "2.45", "3.10", "2.70"],
                ]).map(([h, a, oh, od, oa], i) => (
                  <span key={i} className="inline-flex items-center gap-2">
                    <span className="font-semibold text-foreground/80">{h} vs {a}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{oh}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{od}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">{oa}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          {/* Left: copy + CTAs */}
          <div className="text-center lg:text-left">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary lg:mx-0">
              <Flame className="h-3.5 w-3.5" />
              FIFA World Cup · Live Now
            </div>
            <h1 className="mt-5 text-4xl font-black uppercase tracking-tight sm:text-6xl">
              Bet the <span className="text-primary">World Cup</span>.
              <br />
              Win Big.
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-xs font-semibold uppercase tracking-[0.22em] text-primary/80 sm:text-sm lg:mx-0">
              Competitive Strategy Starts Everywhere
            </p>
            <p className="mx-auto mt-5 max-w-xl text-base text-foreground/85 sm:text-lg lg:mx-0">
              Live odds on every match. Place bets in seconds, track every ticket,
              and cash out your winnings — all in one place.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
              {authed ? (
                <Link to="/dashboard">
                  <Button size="lg" className="gap-2 font-bold uppercase tracking-wide shadow-lg shadow-primary/40 transition-transform hover:scale-[1.03]">
                    Go to Dashboard
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/register">
                    <Button size="lg" className="gap-2 font-bold uppercase tracking-wide shadow-lg shadow-primary/40 transition-transform hover:scale-[1.03]">
                      <Zap className="h-4 w-4" />
                      Join & Bet Now
                    </Button>
                  </Link>
                  <Link to="/auth">
                    <Button size="lg" variant="outline" className="font-bold uppercase tracking-wide transition-colors hover:border-primary hover:text-primary">
                      Log In
                    </Button>
                  </Link>
                </>
              )}
            </div>

            {/* Trust strip */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground sm:text-sm lg:justify-start">
              {[
                { icon: Radio, label: "Live Tracking" },
                { icon: Wallet, label: "Secure Wallet" },
                { icon: History, label: "Bet History" },
                { icon: LifeBuoy, label: "24/7 Support" },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card/60 px-2.5 py-1.5 backdrop-blur"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <Icon className="h-3.5 w-3.5 text-primary/70" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* Right: live bet slip card */}
          <div className="relative">
            <div
              className="absolute -inset-1 rounded-2xl opacity-50 blur-xl"
              style={{ background: "linear-gradient(135deg, color-mix(in oklab, var(--primary) 50%, transparent), transparent)" }}
            />
            <Card className="relative overflow-hidden border-border/80 bg-card/95 p-0 shadow-2xl shadow-primary/10 backdrop-blur">
              {/* Match header */}
              <div className="flex items-center justify-between border-b border-border/70 bg-gradient-to-r from-primary/10 via-transparent to-primary/10 px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-primary">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Live · 67'
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Group Stage
                </span>
              </div>

              {/* Scoreboard */}
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-5">
                <div className="text-right">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Brazil</div>
                  <div className="mt-0.5 text-2xl">🇧🇷</div>
                </div>
                <div className="rounded-lg border border-border bg-background/60 px-4 py-2 font-mono text-2xl font-black tabular-nums">
                  2 <span className="text-muted-foreground">:</span> 1
                </div>
                <div className="text-left">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Argentina</div>
                  <div className="mt-0.5 text-2xl">🇦🇷</div>
                </div>
              </div>

              {/* Odds buttons */}
              <div className="grid grid-cols-3 gap-2 px-4 pb-3">
                {[
                  { label: "1 · BRA", odds: "2.10", trend: "up" },
                  { label: "X · Draw", odds: "3.40", trend: "down" },
                  { label: "2 · ARG", odds: "2.80", trend: "up" },
                ].map((o) => (
                  <button
                    key={o.label}
                    className="group flex flex-col items-center gap-0.5 rounded-md border border-border bg-background/70 px-2 py-2.5 text-xs transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary/10 hover:shadow-md hover:shadow-primary/20"
                  >
                    <span className="font-semibold text-muted-foreground group-hover:text-foreground">{o.label}</span>
                    <span className="flex items-center gap-1 font-mono text-base font-bold text-foreground">
                      {o.odds}
                      {o.trend === "up" ? (
                        <TrendingUp className="h-3 w-3 text-primary" />
                      ) : (
                        <TrendingDown className="h-3 w-3 text-destructive" />
                      )}
                    </span>
                  </button>
                ))}
              </div>

              {/* Slip footer */}
              <div className="border-t border-border/70 bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Stake</span>
                  <span className="font-mono font-semibold text-foreground">100 pts</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Potential payout</span>
                  <span className="font-mono text-base font-black text-primary">210 pts</span>
                </div>
                <Link to={authed ? "/dashboard" : "/register"} className="mt-3 block">
                  <Button size="sm" className="w-full gap-1.5 font-bold uppercase tracking-wide">
                    <Zap className="h-3.5 w-3.5" />
                    Place Bet
                  </Button>
                </Link>
              </div>
            </Card>
          </div>
        </div>

        {/* Ticker keyframes */}
        <style>{`
          @keyframes ticker {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
        `}</style>
      </section>


      {/* How it works */}
      <Suspense fallback={<div className="h-[600px]" />}>
        <HowItWorks />
      </Suspense>



      {/* Support + CTA */}
      <section id="support" className="border-b border-border bg-card/30">
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
      <footer className="bg-background">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-bold">
              <Trophy className="h-5 w-5 text-primary" />
              cssebets
            </div>
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
    </div>
  );
}
