import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Trophy,
  Mail,
  MessageCircle,
  ArrowRight,
  Wallet,
  Coins,
  Target,
  Banknote,
  ShieldCheck,
  Zap,
  Radio,
  HeadphonesIcon,
  Receipt,
  CheckCircle2,
  Trophy as TrophyIcon,
  Flame,
  Crosshair,
  Medal,
  ListChecks,
  History,
  Clock,
  UserPlus,
  UploadCloud,
  CircleCheck,
  Eye,
  ArrowDownCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — FIFA World Cup Match Predictions & Betting Platform" },
      {
        name: "description",
        content:
          "Convert funds into points, place predictions on live FIFA World Cup matches, track your results, and cash out your winnings on CSSEBets.",
      },
      { property: "og:title", content: "CSSEBets — FIFA World Cup Predictions & Betting" },
      {
        property: "og:description",
        content:
          "Convert funds into points, place predictions on live World Cup matches, track results, and cash out winnings.",
      },
    ],
  }),
  component: LandingPage,
});

function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

const TRUST = [
  { icon: ShieldCheck, label: "Secure Wallet Tracking" },
  { icon: Zap, label: "Fast Point Approval" },
  { icon: Radio, label: "Live Match Predictions" },
  { icon: Banknote, label: "Cash-Out Requests Supported" },
  { icon: HeadphonesIcon, label: "Customer Support Available" },
  { icon: Receipt, label: "Full Transaction History" },
];

const WHY = [
  { icon: CheckCircle2, title: "Simple Betting Experience", desc: "Pick a match, place your prediction in seconds." },
  { icon: TrophyIcon, title: "World Cup Match Coverage", desc: "Every fixture of the FIFA World Cup, in one place." },
  { icon: Coins, title: "Easy Point Management", desc: "Top up, track, and cash out points effortlessly." },
  { icon: Target, title: "Track Every Prediction", desc: "See open, settled, won, and lost bets at a glance." },
  { icon: History, title: "View Betting History", desc: "Full history of every transaction and wager." },
  { icon: HeadphonesIcon, title: "Dedicated Support Team", desc: "Real humans, available daily to help you out." },
  { icon: Zap, title: "Fast Approval Workflow", desc: "Point requests are reviewed quickly so you can play." },
  { icon: Radio, title: "Real-Time Match Updates", desc: "Live odds and match state as the action unfolds." },
];

const STEPS = [
  { n: 1, icon: UserPlus, title: "Register Your Account", desc: "Sign up in under a minute." },
  { n: 2, icon: UploadCloud, title: "Request Points", desc: "Upload your payment proof and submit a request." },
  { n: 3, icon: CircleCheck, title: "Receive Approved Points", desc: "Admin verifies and credits your wallet." },
  { n: 4, icon: Target, title: "Place Predictions", desc: "Choose matches and place your bets." },
  { n: 5, icon: Eye, title: "Track Results", desc: "Follow match outcomes and settled bets." },
  { n: 6, icon: ArrowDownCircle, title: "Cash Out", desc: "Submit a withdrawal request when eligible." },
];

const JOURNEY = [
  "John deposits RM100",
  "Admin approves the request",
  "John receives 1,000 points",
  "John places predictions",
  "John wins",
  "John requests payout",
  "Admin processes withdrawal",
];

const MARKETS = [
  { icon: TrophyIcon, title: "Match Winner", desc: "Pick the team you think will win the match." },
  { icon: ListChecks, title: "Draw", desc: "Bet on the match ending in a draw." },
  { icon: Medal, title: "Tournament Winner", desc: "Predict the overall World Cup champion." },
  { icon: Crosshair, title: "Correct Score", desc: "Higher payouts for predicting the exact score." },
  { icon: Flame, title: "Additional Markets", desc: "More markets released as the tournament progresses." },
];

const LEADERBOARD = [
  { label: "Top Winner This Week", name: "Striker99", value: "+8,420 pts" },
  { label: "Most Active Predictor", name: "MidfieldMaestro", value: "47 bets" },
  { label: "Highest Accuracy", name: "GoalLine_Guru", value: "78% wins" },
];

const FAQ = [
  {
    q: "What is CSSEBets?",
    a: "CSSEBets is a FIFA World Cup match predictions and betting platform. You convert funds into points, place predictions on matches, track your results, and cash out your winnings.",
  },
  {
    q: "How do I get points?",
    a: "Sign in, go to your wallet, submit a point request with your payment proof. Once an admin approves it, your points are credited to your wallet.",
  },
  {
    q: "How long does approval take?",
    a: "Most point requests are reviewed within a few hours. Typical end-to-end approval is well under 24 hours.",
  },
  {
    q: "How do I place a prediction?",
    a: "Open a live or upcoming match, choose your market (e.g. Match Winner, Correct Score), enter your stake in points, and confirm your bet.",
  },
  {
    q: "How do I cash out?",
    a: "Submit a withdrawal request from your wallet. Once approved by an admin, your payout is processed.",
  },
  {
    q: "How can I contact support?",
    a: "Email support@cssebets.com or message us on WhatsApp. Support is available daily with a typical response time of under 24 hours.",
  },
];

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
    : { to: "/auth", label: "Sign Up" };

  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-bold tracking-tight">
            <Trophy className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">cssebets</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            <button onClick={() => scrollToId("how")} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              How It Works
            </button>
            <button onClick={() => scrollToId("why")} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              Why Us
            </button>
            <button onClick={() => scrollToId("faq")} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
              FAQ
            </button>
            <button onClick={() => scrollToId("support")} className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">
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
        <div className="relative mx-auto max-w-5xl px-4 py-12 text-center sm:py-20">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            FIFA World Cup · Live
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            FIFA World Cup Match Predictions <span className="text-primary">& Betting Platform</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">
            Convert funds into points, place predictions on live World Cup matches, track your results, and cash out your winnings.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to={authed ? "/dashboard" : "/auth"}>
              <Button size="lg" className="gap-2">
                {authed ? "Go to Dashboard" : "Sign Up"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" onClick={() => scrollToId("how")}>
              Learn How It Works
            </Button>
          </div>

          {/* 4-step flow */}
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Wallet, label: "Deposit" },
              { icon: Coins, label: "Receive Points" },
              { icon: Target, label: "Place Bets" },
              { icon: Banknote, label: "Cash Out" },
            ].map((s, i) => (
              <div key={s.label} className="relative">
                <Card className="flex flex-col items-center gap-2 p-4">
                  <s.icon className="h-6 w-6 text-primary" />
                  <div className="text-xs font-semibold sm:text-sm">
                    <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                    {s.label}
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TRUST.map((t) => (
              <Card key={t.label} className="flex flex-col items-center gap-2 p-4 text-center">
                <t.icon className="h-5 w-5 text-primary" />
                <div className="text-xs font-medium leading-tight sm:text-sm">{t.label}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Why */}
      <section id="why" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Why Use CSSEBets?</h2>
            <p className="mt-2 text-sm text-muted-foreground">Built around the World Cup, designed for clarity and speed.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w) => (
              <Card key={w.title} className="p-5 transition-colors hover:border-primary/50">
                <w.icon className="h-6 w-6 text-primary" />
                <div className="mt-3 font-semibold">{w.title}</div>
                <div className="mt-1 text-sm text-muted-foreground">{w.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">How It Works</h2>
            <p className="mt-2 text-sm text-muted-foreground">Six simple steps from sign-up to cash out.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <Card key={s.n} className="relative overflow-hidden p-5">
                <div className="absolute -right-4 -top-4 text-7xl font-black text-primary/10">{s.n}</div>
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {s.n}</div>
                  </div>
                  <div className="mt-3 font-semibold">{s.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Example journey */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <div className="mb-8 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Example</div>
            <h2 className="mt-2 text-2xl font-bold sm:text-3xl">A Player's Journey</h2>
          </div>
          <div className="flex flex-col items-center gap-2">
            {JOURNEY.map((step, i) => (
              <div key={step} className="flex w-full flex-col items-center">
                <Card className="w-full max-w-sm p-3 text-center text-sm font-medium">{step}</Card>
                {i < JOURNEY.length - 1 && (
                  <div className="my-1 text-primary">↓</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Markets */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Available Markets</h2>
            <p className="mt-2 text-sm text-muted-foreground">Bet the ways you love most.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {MARKETS.map((m) => (
              <Card key={m.title} className="p-5 text-center">
                <m.icon className="mx-auto h-6 w-6 text-primary" />
                <div className="mt-3 font-semibold">{m.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Leaderboard preview */}
      <section className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Leaderboard Preview</h2>
            <p className="mt-2 text-sm text-muted-foreground">Sample standings — climb the ranks once you join.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {LEADERBOARD.map((l) => (
              <Card key={l.label} className="p-5">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{l.label}</div>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold">
                    <Medal className="h-5 w-5 text-primary" />
                    {l.name}
                  </div>
                  <div className="text-sm font-bold text-primary">{l.value}</div>
                </div>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">Sample data shown for illustration.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="w-full">
            {FAQ.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Support */}
      <section id="support" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-primary">Customer Support</div>
              <h2 className="mt-2 text-2xl font-bold sm:text-3xl">Need help?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Contact our support team for account access, point requests, wallet questions, or anything else.
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                Support available daily · Typical response within 24 hours
              </div>
              <a href="mailto:support@cssebets.com" className="mt-5 inline-block">
                <Button size="lg" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Contact Support
                </Button>
              </a>
            </div>
            <div className="grid gap-3">
              <Card className="flex items-center gap-3 p-4">
                <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">WhatsApp</div>
                  <div className="truncate font-medium">+60 11 142 11004</div>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <Mail className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a href="mailto:support@cssebets.com" className="block truncate font-medium hover:text-primary">
                    support@cssebets.com
                  </a>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4">
                <Clock className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Support Hours</div>
                  <div className="font-medium">Daily · 9am – 9pm (MYT)</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-background">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <div className="flex items-center gap-2 font-bold">
                <Trophy className="h-5 w-5 text-primary" />
                cssebets
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                FIFA World Cup match predictions and betting platform. Convert funds for points and cash out winnings.
              </p>
            </div>
            <div>
              <div className="text-sm font-semibold">Quick Links</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><Link to="/" className="hover:text-foreground">Home</Link></li>
                <li><Link to="/auth" className="hover:text-foreground">Register</Link></li>
                <li><Link to="/auth" className="hover:text-foreground">Sign In</Link></li>
                <li><button onClick={() => scrollToId("how")} className="hover:text-foreground">How It Works</button></li>
                <li><button onClick={() => scrollToId("support")} className="hover:text-foreground">Contact Support</button></li>
              </ul>
            </div>
            <div>
              <div className="text-sm font-semibold">Contact</div>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li><a href="mailto:support@cssebets.com" className="hover:text-foreground">support@cssebets.com</a></li>
                <li>WhatsApp: +60 11 142 11004</li>
                <li>Daily · 9am – 9pm (MYT)</li>
              </ul>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>© {new Date().getFullYear()} cssebets. All rights reserved.</div>
            <div>Bet responsibly. Must be of legal age in your jurisdiction.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
