import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Trophy,
  ShieldCheck,
  Wallet as WalletIcon,
  ListChecks,
  History,
  Activity,
  BarChart3,
  FileCheck2,
  Lock,
  Mail,
  MessageCircle,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — Private World Cup Prediction Platform" },
      {
        name: "description",
        content:
          "CSSEBets is a private virtual-points World Cup prediction platform. Track matches, place predictions, and follow the leaderboard. Virtual points only.",
      },
      { property: "og:title", content: "CSSEBets — Private World Cup Prediction Platform" },
      {
        property: "og:description",
        content:
          "A simple, transparent prediction platform with virtual points, reference odds, and an admin-reviewed wallet system.",
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
          <Link to="/" className="flex items-center gap-2 font-bold">
            <Trophy className="h-5 w-5 text-primary" />
            <span>CSSEBets</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <button
              onClick={() => scrollToId("about")}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              About
            </button>
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
          <Link to={primaryCta.to}>
            <Button size="sm">{primaryCta.label}</Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 35%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-5xl px-4 py-20 text-center sm:py-28">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/20">
            <Trophy className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">CSSEBets</h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-muted-foreground sm:text-lg">
            A private virtual-points World Cup prediction platform built for simple,
            transparent match predictions.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
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
          <p className="mx-auto mt-8 max-w-xl text-xs text-muted-foreground">
            Virtual points only. No real-money payments, withdrawals, or cashout are processed
            on this platform.
          </p>
        </div>
      </section>

      {/* About */}
      <section id="about" className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-bold">About CSSEBets</h2>
            <p className="mt-4 text-muted-foreground">
              CSSEBets is a simple prediction platform where users can view football matches,
              check reference odds, request virtual points, place match predictions, and track
              their results through a transparent wallet and leaderboard system.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[
              "Match predictions",
              "Virtual points",
              "Live scores",
              "Reference odds",
              "Wallet history",
              "Leaderboard",
              "Admin-reviewed point requests",
              "Private pool",
            ].map((t) => (
              <div
                key={t}
                className="rounded-lg border border-border bg-card px-3 py-2 text-center text-sm text-card-foreground"
              >
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold">How To Use</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Get started in four steps.
            </p>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { n: 1, title: "Register or sign in", desc: "Create an account or sign in to your existing one." },
              { n: 2, title: "Request virtual points", desc: "Open the wallet page and request virtual points." },
              { n: 3, title: "Upload proof", desc: "Upload proof or confirmation if required by an admin." },
              { n: 4, title: "Pick & predict", desc: "Choose a match, place a prediction, and track your result." },
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
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Predictions lock when the match starts.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Features</h2>
          </div>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Activity, label: "Live Match Tracker" },
              { icon: BarChart3, label: "Reference Odds" },
              { icon: WalletIcon, label: "Virtual Wallet" },
              { icon: FileCheck2, label: "Point Request Approval" },
              { icon: History, label: "Prediction History" },
              { icon: Trophy, label: "Leaderboard" },
              { icon: ShieldCheck, label: "Secure Admin Review" },
              { icon: ListChecks, label: "Transparent Transactions" },
            ].map((f) => (
              <Card key={f.label} className="flex items-center gap-3 p-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary">
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="font-medium">{f.label}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-5xl px-4 py-16">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                <Lock className="h-5 w-5" />
              </div>
              <h2 className="text-3xl font-bold">Safety & Transparency</h2>
              <p className="mt-3 text-sm text-muted-foreground">
                Every action on CSSEBets is logged and auditable, with virtual points only.
              </p>
            </div>
            <ul className="space-y-3 text-sm">
              {[
                "All wallet movements are recorded.",
                "Predictions are locked after kickoff.",
                "Results and payouts are handled by the system.",
                "Admin approvals are logged.",
                "Uploaded proof files are reviewed by admins only.",
              ].map((t) => (
                <li key={t} className="flex gap-2 rounded-lg border border-border bg-card p-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground">
            This platform uses virtual points only.
          </p>
        </div>
      </section>

      {/* Support */}
      <section id="support" className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h2 className="text-3xl font-bold">Need help?</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            For account access, point requests, prediction issues, or wallet questions,
            contact CSSEBets support.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Card className="flex items-center gap-3 p-4 text-left">
              <MessageCircle className="h-5 w-5 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">WhatsApp Support</div>
                <div className="font-medium">+60 XX-XXX XXXX</div>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4 text-left">
              <Mail className="h-5 w-5 text-primary" />
              <div>
                <div className="text-xs text-muted-foreground">Email Support</div>
                <a
                  href="mailto:support@cssebets.com"
                  className="font-medium hover:text-primary"
                >
                  support@cssebets.com
                </a>
              </div>
            </Card>
          </div>
          <a href="mailto:support@cssebets.com" className="mt-6 inline-block">
            <Button size="lg" className="gap-2">
              <Mail className="h-4 w-4" />
              Contact Support
            </Button>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background">
        <div className="mx-auto max-w-5xl px-4 py-10">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 font-bold">
              <Trophy className="h-5 w-5 text-primary" />
              CSSEBets
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <a href="mailto:support@cssebets.com" className="hover:text-foreground">
                support@cssebets.com
              </a>
              <Link to={primaryCta.to} className="hover:text-foreground">
                {primaryCta.label}
              </Link>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Virtual points only. No real-money payments, withdrawals, or cashout are processed
            on this platform.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            © {new Date().getFullYear()} CSSEBets. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
