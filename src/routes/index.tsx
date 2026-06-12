import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Trophy,
  ShieldCheck,
  Wallet as WalletIcon,
  History,
  Activity,
  BarChart3,
  FileCheck2,
  Mail,
  MessageCircle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "cssebets — Competitive Strategy Starts Everywhere" },
      {
        name: "description",
        content:
          "cssebets is a betting platform for FIFA World Cup matches. Convert cash for points, check reference odds, place bets, and track results.",
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

  const features = [
    { icon: Activity, label: "Live Match Tracker", desc: "Follow every World Cup fixture in real time." },
    { icon: BarChart3, label: "Reference Odds", desc: "Transparent odds on every market before you bet." },
    { icon: WalletIcon, label: "Virtual Wallet", desc: "Manage your points balance with full history." },
    { icon: FileCheck2, label: "Point Requests", desc: "Convert cash to points with admin approval." },
    { icon: History, label: "Bet History", desc: "Review every bet, stake, and payout you've made." },
    { icon: ShieldCheck, label: "Secure & Audited", desc: "Every action logged and admin reviewed." },
  ];

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
              onClick={() => scrollToId("features")}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Features
            </button>
            <button
              onClick={() => scrollToId("support")}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              Support
            </button>
          </nav>
          <Link to={primaryCta.to}>
            <Button size="sm">{primaryCta.label}</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 40%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-16 text-center sm:py-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            FIFA World Cup · Live
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Competitive Strategy <span className="text-primary">Starts Everywhere</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            The smartest way to play the World Cup. Convert cash to points, place bets, win big.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to={primaryCta.to}>
              <Button size="lg" className="gap-2">
                {primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" onClick={() => scrollToId("how")}>
              How It Works
            </Button>
          </div>

          {/* About strip */}
          <p className="mx-auto mt-12 max-w-2xl text-sm text-muted-foreground">
            cssebets is a betting platform where users can view FIFA WORLD CUP matches,
            check reference odds, request virtual points, place match bets, and track
            their results through a transparent wallet.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <div className="text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
            <p className="mt-2 text-sm text-muted-foreground">Get started in four steps.</p>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 1, title: "Register", desc: "Create an account or sign in." },
              { n: 2, title: "Request points", desc: "Convert cash to virtual points." },
              { n: 3, title: "Upload proof", desc: "Confirm your request for admin review." },
              { n: 4, title: "Place bets", desc: "Pick a match and track your result." },
            ].map((s) => (
              <Card key={s.n} className="p-5">
                <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {s.n}
                </div>
                <div className="font-semibold">{s.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Built for serious players</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Everything you need to bet smart on the World Cup.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border">
            {features.map((f) => (
              <div
                key={f.label}
                className="group flex flex-col gap-2 bg-card p-3 transition-colors hover:bg-card/60 sm:p-5"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary sm:h-9 sm:w-9">
                  <f.icon className="h-4 w-4" />
                </div>
                <div className="text-sm font-semibold leading-tight sm:text-base">{f.label}</div>
                <div className="hidden text-xs text-muted-foreground sm:block">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

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
                  <div className="font-medium">+60 XX-XXX XXXX</div>
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
