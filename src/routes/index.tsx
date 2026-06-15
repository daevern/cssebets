import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Headphones,
  Receipt,
  CheckCircle2,
  Flame,
  Crosshair,
  Medal,
  ListChecks,
  History,
  Clock,
  UserPlus,
  UploadCloud,
  CheckCircle,
  Eye,
  ArrowDownCircle,
  TrendingUp,
  Users,
  Activity,
  Sparkles,
  Star,
  CircleDot,
  Timer,
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

/* ───────────────────────── Animated Counter ───────────────────────── */
function Counter({
  to,
  duration = 1.6,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  to: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) =>
    `${prefix}${v.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`,
  );
  const [text, setText] = useState(`${prefix}0${suffix}`);
  useEffect(() => {
    const unsub = rounded.on("change", setText);
    return () => unsub();
  }, [rounded]);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, { duration, ease: "easeOut" });
    return () => controls.stop();
  }, [inView, to, duration, mv]);
  return <span ref={ref}>{text}</span>;
}

/* ───────────────────────── Money Rain ───────────────────────── */
function MoneyRain() {
  const items = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 6,
        duration: 6 + Math.random() * 6,
        size: 14 + Math.random() * 14,
        emoji: ["💰", "💵", "⚽", "🏆", "🎯"][i % 5],
      })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((it) => (
        <motion.span
          key={it.id}
          className="absolute opacity-40"
          style={{ left: `${it.left}%`, top: -40, fontSize: it.size }}
          initial={{ y: -40, rotate: 0 }}
          animate={{ y: "110vh", rotate: 360 }}
          transition={{
            duration: it.duration,
            delay: it.delay,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          {it.emoji}
        </motion.span>
      ))}
    </div>
  );
}

/* ───────────────────────── Data ───────────────────────── */
const STATS = [
  { icon: Users, label: "Active Bettors", value: 2847, suffix: "+" },
  { icon: Target, label: "Total Predictions", value: 18429 },
  { icon: TrendingUp, label: "Weekly Winnings", value: 184750, prefix: "RM " },
  { icon: Banknote, label: "Total Cash Outs", value: 942300, prefix: "RM " },
];

const TICKER = [
  "💰 Striker99 just won RM 1,240 on Brazil vs Croatia",
  "⚽ MidfieldMaestro placed 8 predictions in the last hour",
  "🏆 GoalLine_Guru cashed out RM 3,500",
  "🔥 ArgFan10 won big on Correct Score 2-1",
  "🎯 New leader: PenaltyKing — 82% accuracy this week",
  "💵 ZidaneFan cashed out RM 980",
  "⚡ Live now: France vs Morocco — odds updating",
  "🚀 KaiserKlaus on a 6-bet winning streak",
];

type FeedItem = { kind: "win" | "bet" | "cashout"; user: string; detail: string; time: string };
const FEED: FeedItem[] = [
  { kind: "win", user: "Striker99", detail: "Won RM 1,240 · Brazil ML", time: "12s ago" },
  { kind: "bet", user: "PenaltyKing", detail: "100 pts on France -1", time: "34s ago" },
  { kind: "cashout", user: "GoalLine_Guru", detail: "Cashed out RM 3,500", time: "1m ago" },
  { kind: "win", user: "KaiserKlaus", detail: "Won RM 420 · Correct Score", time: "2m ago" },
  { kind: "bet", user: "ArgFan10", detail: "250 pts on Argentina Draw No Bet", time: "3m ago" },
  { kind: "win", user: "ZidaneFan", detail: "Won RM 880 · Over 2.5", time: "5m ago" },
  { kind: "cashout", user: "MidfieldMaestro", detail: "Cashed out RM 1,120", time: "7m ago" },
  { kind: "bet", user: "TikiTakaKid", detail: "60 pts on Spain ML", time: "9m ago" },
];

const MATCHES = [
  {
    home: "Brazil",
    away: "Croatia",
    kickoff: Date.now() + 1000 * 60 * 60 * 3 + 1000 * 60 * 42,
    odds: { home: 1.55, draw: 3.9, away: 5.6 },
    flagHome: "🇧🇷",
    flagAway: "🇭🇷",
    tag: "Featured",
  },
  {
    home: "France",
    away: "Morocco",
    kickoff: Date.now() + 1000 * 60 * 60 * 8,
    odds: { home: 1.72, draw: 3.4, away: 4.8 },
    flagHome: "🇫🇷",
    flagAway: "🇲🇦",
    tag: "Hot",
  },
  {
    home: "Argentina",
    away: "Netherlands",
    kickoff: Date.now() + 1000 * 60 * 60 * 26,
    odds: { home: 2.05, draw: 3.1, away: 3.6 },
    flagHome: "🇦🇷",
    flagAway: "🇳🇱",
    tag: "Live odds",
  },
];

const TOP_WINNERS = {
  daily: [
    { name: "Striker99", amt: 4280 },
    { name: "PenaltyKing", amt: 3120 },
    { name: "KaiserKlaus", amt: 2410 },
  ],
  weekly: [
    { name: "GoalLine_Guru", amt: 18420 },
    { name: "MidfieldMaestro", amt: 14210 },
    { name: "ArgFan10", amt: 9870 },
  ],
  biggest: { name: "TikiTakaKid", amt: 24500, market: "Correct Score 3-2" },
};

const AGENTS = [
  { name: "Agent Falcon", bettors: 312, volume: 84200, rank: 1 },
  { name: "Agent Cobra", bettors: 268, volume: 71500, rank: 2 },
  { name: "Agent Tiger", bettors: 214, volume: 58900, rank: 3 },
  { name: "Agent Hawk", bettors: 187, volume: 47300, rank: 4 },
];

const TRUST = [
  { icon: Zap, label: "Fast Payouts", sub: "Approved in hours" },
  { icon: Radio, label: "Live Matches", sub: "Real-time odds" },
  { icon: Headphones, label: "Active Support", sub: "Daily, 9–9 MYT" },
  { icon: ShieldCheck, label: "Secure Wallet", sub: "Tracked every cent" },
];

const WHY = [
  { icon: CheckCircle2, title: "Bet in Seconds", desc: "Pick a match, pick a market, you're in." },
  { icon: Trophy, title: "Full World Cup Action", desc: "Every fixture, every market, one place." },
  { icon: Coins, title: "Points That Move", desc: "Top up, play, cash out — no friction." },
  { icon: Target, title: "Pro Tracking", desc: "Open, settled, won, lost — at a glance." },
  { icon: History, title: "Full Receipts", desc: "Every wager, every payout, on record." },
  { icon: Headphones, title: "Humans on Standby", desc: "Real people, not bots." },
  { icon: Zap, title: "Lightning Approval", desc: "Top ups reviewed in hours, not days." },
  { icon: Radio, title: "Live Match Pulse", desc: "Odds shift the moment the game does." },
];

const STEPS = [
  { n: 1, icon: UserPlus, title: "Register", desc: "Sign up in under a minute." },
  { n: 2, icon: UploadCloud, title: "Request Points", desc: "Upload payment proof and submit." },
  { n: 3, icon: CheckCircle, title: "Get Credited", desc: "Admin verifies and credits your wallet." },
  { n: 4, icon: Target, title: "Place Bets", desc: "Choose matches and lock in predictions." },
  { n: 5, icon: Eye, title: "Track Results", desc: "Follow live outcomes and settled bets." },
  { n: 6, icon: ArrowDownCircle, title: "Cash Out", desc: "Submit a withdrawal whenever you're ready." },
];

const MARKETS = [
  { icon: Trophy, title: "Match Winner", desc: "Back the team you trust." },
  { icon: ListChecks, title: "Draw", desc: "When neither side breaks through." },
  { icon: Medal, title: "Tournament Winner", desc: "Call the World Cup champion." },
  { icon: Crosshair, title: "Correct Score", desc: "High risk. Higher reward." },
  { icon: Flame, title: "More Markets", desc: "New markets drop as the cup unfolds." },
];

const FAQ = [
  { q: "What is CSSEBets?", a: "A FIFA World Cup predictions and betting platform. Convert funds into points, place predictions, track results, and cash out winnings." },
  { q: "How do I get points?", a: "Go to your wallet, submit a point request with your payment proof. An admin approves it and points hit your wallet." },
  { q: "How long does approval take?", a: "Most requests are reviewed within a few hours. Almost always under 24 hours." },
  { q: "How do I place a prediction?", a: "Open a match, choose a market, enter your stake in points, confirm. Done." },
  { q: "How do I cash out?", a: "Submit a withdrawal request from your wallet. Admin processes the payout." },
  { q: "How can I contact support?", a: "Email support@cssebets.com or message us on WhatsApp. Daily, typical reply within 24 hours." },
];

/* ───────────────────────── Countdown ───────────────────────── */
function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, to - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const cell = (v: number, l: string) => (
    <div className="flex flex-col items-center">
      <div className="rounded-md bg-primary/10 px-2 py-1 font-mono text-sm font-bold tabular-nums text-primary">
        {String(v).padStart(2, "0")}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{l}</div>
    </div>
  );
  return (
    <div className="flex items-center gap-1.5">
      {cell(h, "hrs")}
      {cell(m, "min")}
      {cell(s, "sec")}
    </div>
  );
}

/* ───────────────────────── Ticker ───────────────────────── */
function Ticker() {
  const items = [...TICKER, ...TICKER];
  return (
    <div className="relative overflow-hidden border-y border-border bg-card/40 py-2.5">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
      <motion.div
        className="flex w-max gap-10 whitespace-nowrap text-sm"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 45, ease: "linear", repeat: Infinity }}
      >
        {items.map((t, i) => (
          <span key={i} className="text-muted-foreground">
            <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" />
            {t}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

/* ───────────────────────── Page ───────────────────────── */
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
    : { to: "/auth", label: "Sign Up Free" };

  return (
    <div className="min-h-screen bg-background text-foreground scroll-smooth">
      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 font-bold tracking-tight">
            <Trophy className="h-5 w-5 shrink-0 text-primary" />
            <span className="truncate">cssebets</span>
            <Badge variant="secondary" className="ml-1 hidden gap-1 text-[10px] sm:inline-flex">
              <CircleDot className="h-2.5 w-2.5 animate-pulse text-primary" /> LIVE
            </Badge>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["matches", "Matches"],
              ["how", "How"],
              ["winners", "Winners"],
              ["faq", "FAQ"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => scrollToId(id)}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </nav>
          <Link to={primaryCta.to}>
            <Button size="sm" className="gap-1">
              {primaryCta.label}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--primary) 45%, transparent), transparent)",
          }}
        />
        <MoneyRain />
        <div className="relative mx-auto max-w-6xl px-4 py-12 text-center sm:py-20">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-xs font-medium text-primary"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            FIFA World Cup · Matches Live Now
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-3xl font-black tracking-tight sm:text-5xl md:text-6xl"
          >
            Bet the Beautiful Game.
            <br />
            <span className="bg-gradient-to-r from-primary via-primary to-primary/60 bg-clip-text text-transparent">
              Win in Points. Cash in RM.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base"
          >
            Convert funds into points, fire off predictions on live World Cup matches, watch the results roll in, and cash out your winnings. No nonsense.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="mt-7 flex flex-wrap items-center justify-center gap-3"
          >
            <Link to={authed ? "/dashboard" : "/auth"}>
              <Button size="lg" className="gap-2 shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]">
                <Sparkles className="h-4 w-4" />
                {authed ? "Go to Dashboard" : "Sign Up Free"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" onClick={() => scrollToId("how")}>
              Learn How It Works
            </Button>
          </motion.div>

          {/* 4-step flow */}
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { icon: Wallet, label: "Deposit" },
              { icon: Coins, label: "Get Points" },
              { icon: Target, label: "Place Bets" },
              { icon: Banknote, label: "Cash Out" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 * i }}
              >
                <Card className="group flex flex-col items-center gap-2 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-md hover:shadow-primary/10">
                  <s.icon className="h-6 w-6 text-primary transition-transform group-hover:scale-110" />
                  <div className="text-xs font-semibold sm:text-sm">
                    <span className="mr-1 text-muted-foreground">{i + 1}.</span>
                    {s.label}
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Ticker */}
      <Ticker />

      {/* Stats */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {STATS.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 * i }}
              >
                <Card className="group relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
                  <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/5 transition-all group-hover:bg-primary/15" />
                  <div className="relative">
                    <s.icon className="h-5 w-5 text-primary" />
                    <div className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                      <Counter to={s.value} prefix={s.prefix ?? ""} suffix={s.suffix ?? ""} />
                    </div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      {s.label}
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Live feed + Match center */}
      <section id="matches" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-primary">
                <Activity className="h-3.5 w-3.5" /> Live Now
              </div>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Match Center & Activity</h2>
            </div>
            <div className="text-xs text-muted-foreground">Updated in real time</div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Matches */}
            <div className="grid gap-3">
              {MATCHES.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.05 * i }}
                >
                  <Card className="group overflow-hidden p-0 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
                    <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-2 text-xs">
                      <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                        <Flame className="h-3 w-3" /> {m.tag}
                      </Badge>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer className="h-3.5 w-3.5" /> Kickoff in
                        <Countdown to={m.kickoff} />
                      </div>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="text-2xl">{m.flagHome}</span>
                        <span className="truncate font-bold">{m.home}</span>
                      </div>
                      <div className="text-xs font-bold text-muted-foreground">VS</div>
                      <div className="flex min-w-0 items-center justify-end gap-2 text-right">
                        <span className="truncate font-bold">{m.away}</span>
                        <span className="text-2xl">{m.flagAway}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-border bg-card/40 p-3">
                      {[
                        { label: m.home, v: m.odds.home },
                        { label: "Draw", v: m.odds.draw },
                        { label: m.away, v: m.odds.away },
                      ].map((o) => (
                        <button
                          key={o.label}
                          className="group/odd rounded-md border border-border bg-background px-2 py-2 text-center transition-all hover:border-primary hover:bg-primary/5"
                        >
                          <div className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                            {o.label}
                          </div>
                          <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-primary">
                            {o.v.toFixed(2)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Live activity feed */}
            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-border bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Live Activity
                </div>
                <div className="text-xs text-muted-foreground">last 10 min</div>
              </div>
              <div className="max-h-[420px] divide-y divide-border overflow-hidden">
                {FEED.map((f, i) => {
                  const meta = {
                    win: { icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-500/10" },
                    bet: { icon: Target, color: "text-primary", bg: "bg-primary/10" },
                    cashout: { icon: Banknote, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                  }[f.kind];
                  const Icon = meta.icon;
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.03 * i }}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-card/60"
                    >
                      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${meta.bg}`}>
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{f.user}</div>
                        <div className="truncate text-xs text-muted-foreground">{f.detail}</div>
                      </div>
                      <div className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {f.time}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {TRUST.map((t) => (
              <Card key={t.label} className="group flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary transition-transform group-hover:scale-110">
                  <t.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold">{t.label}</div>
                  <div className="truncate text-xs text-muted-foreground">{t.sub}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Top winners + Agents */}
      <section id="winners" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">Hall of Fame</div>
            <h2 className="mt-2 text-2xl font-black sm:text-3xl">Top Winners & Agents</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* Daily */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Today's Winners</div>
                <Badge className="gap-1"><Flame className="h-3 w-3" />Hot</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {TOP_WINNERS.daily.map((w, i) => (
                  <div key={w.name} className="flex items-center gap-3">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${
                      i === 0 ? "bg-yellow-500/20 text-yellow-500" :
                      i === 1 ? "bg-zinc-400/20 text-zinc-300" :
                      "bg-amber-700/20 text-amber-600"
                    }`}>{i + 1}</div>
                    <div className="flex-1 truncate font-semibold">{w.name}</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-primary">
                      +RM <Counter to={w.amt} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Weekly */}
            <Card className="p-5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">This Week</div>
                <Badge variant="secondary" className="gap-1"><Star className="h-3 w-3" />Top 3</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {TOP_WINNERS.weekly.map((w, i) => (
                  <div key={w.name} className="flex items-center gap-3">
                    <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${
                      i === 0 ? "bg-yellow-500/20 text-yellow-500" :
                      i === 1 ? "bg-zinc-400/20 text-zinc-300" :
                      "bg-amber-700/20 text-amber-600"
                    }`}>{i + 1}</div>
                    <div className="flex-1 truncate font-semibold">{w.name}</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-primary">
                      +RM <Counter to={w.amt} />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Biggest payout */}
            <Card className="relative overflow-hidden p-5">
              <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/10 blur-2xl" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Biggest Payout</div>
                  <Trophy className="h-4 w-4 text-yellow-500" />
                </div>
                <div className="mt-6 text-4xl font-black text-primary">
                  RM <Counter to={TOP_WINNERS.biggest.amt} />
                </div>
                <div className="mt-2 text-sm font-semibold">{TOP_WINNERS.biggest.name}</div>
                <div className="text-xs text-muted-foreground">{TOP_WINNERS.biggest.market}</div>
              </div>
            </Card>
          </div>

          {/* Agent leaderboard */}
          <div className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold">Top Agents</h3>
              <div className="text-xs text-muted-foreground">Ranked by volume</div>
            </div>
            <Card className="overflow-hidden p-0">
              <div className="grid grid-cols-[40px_1fr_auto_auto] gap-3 border-b border-border bg-card/60 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <div>#</div><div>Agent</div><div className="text-right">Bettors</div><div className="text-right">Volume</div>
              </div>
              {AGENTS.map((a) => (
                <div key={a.name} className="grid grid-cols-[40px_1fr_auto_auto] items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 transition-colors hover:bg-card/40">
                  <div className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${
                    a.rank === 1 ? "bg-yellow-500/20 text-yellow-500" :
                    a.rank === 2 ? "bg-zinc-400/20 text-zinc-300" :
                    a.rank === 3 ? "bg-amber-700/20 text-amber-600" :
                    "bg-muted text-muted-foreground"
                  }`}>{a.rank}</div>
                  <div className="truncate font-semibold">{a.name}</div>
                  <div className="text-right font-mono text-sm tabular-nums">
                    <Counter to={a.bettors} />
                  </div>
                  <div className="text-right font-mono text-sm font-bold tabular-nums text-primary">
                    RM <Counter to={a.volume} />
                  </div>
                </div>
              ))}
            </Card>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black sm:text-3xl">Why Players Stay</h2>
            <p className="mt-2 text-sm text-muted-foreground">Built for the World Cup. Designed for speed.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {WHY.map((w, i) => (
              <motion.div
                key={w.title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.04 * i }}
              >
                <Card className="group h-full p-5 transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary transition-transform group-hover:scale-110">
                    <w.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 font-bold">{w.title}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{w.desc}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black sm:text-3xl">From Zero to Cash Out</h2>
            <p className="mt-2 text-sm text-muted-foreground">Six steps. No friction.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.05 * i }}
              >
                <Card className="group relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                  <div className="absolute -right-4 -top-4 text-7xl font-black text-primary/10 transition-all group-hover:text-primary/20">
                    {s.n}
                  </div>
                  <div className="relative">
                    <div className="flex items-center gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Step {s.n}</div>
                    </div>
                    <div className="mt-3 font-bold">{s.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{s.desc}</div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Markets */}
      <section className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black sm:text-3xl">Pick Your Market</h2>
            <p className="mt-2 text-sm text-muted-foreground">Multiple ways to play every match.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {MARKETS.map((m, i) => (
              <motion.div
                key={m.title}
                initial={{ opacity: 0, scale: 0.96 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: 0.04 * i }}
              >
                <Card className="group h-full p-5 text-center transition-all hover:-translate-y-1 hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
                  <m.icon className="mx-auto h-6 w-6 text-primary transition-transform group-hover:scale-110" />
                  <div className="mt-3 font-bold">{m.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{m.desc}</div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-b border-border">
        <div className="mx-auto max-w-3xl px-4 py-14">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black sm:text-3xl">Questions, Answered</h2>
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
      <section id="support" className="border-b border-border bg-card/30">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-center">
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest text-primary">Support</div>
              <h2 className="mt-2 text-2xl font-black sm:text-3xl">Stuck? We've got you.</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Real humans for account, points, wallet, or anything else.
              </p>
              <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" />
                Daily · Typical reply within 24 hours
              </div>
              <a href="mailto:support@cssebets.com" className="mt-5 inline-block">
                <Button size="lg" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Contact Support
                </Button>
              </a>
            </div>
            <div className="grid gap-3">
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                <MessageCircle className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">WhatsApp</div>
                  <div className="truncate font-medium">+60 11 142 11004</div>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                <Mail className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Email</div>
                  <a href="mailto:support@cssebets.com" className="block truncate font-medium hover:text-primary">
                    support@cssebets.com
                  </a>
                </div>
              </Card>
              <Card className="flex items-center gap-3 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60">
                <Clock className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">Hours</div>
                  <div className="font-medium">Daily · 9am – 9pm (MYT)</div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 100%, color-mix(in oklab, var(--primary) 45%, transparent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-black sm:text-4xl">The whistle's about to blow.</h2>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">
            Sign up, get your points approved, and lock in your first prediction in minutes.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to={authed ? "/dashboard" : "/auth"}>
              <Button size="lg" className="gap-2 shadow-lg shadow-primary/30 transition-transform hover:scale-[1.03]">
                <Sparkles className="h-4 w-4" />
                {authed ? "Open Dashboard" : "Sign Up Free"}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Button size="lg" variant="outline" onClick={() => scrollToId("matches")}>
              See Live Matches
            </Button>
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
                FIFA World Cup match predictions and betting. Convert funds for points, cash out winnings.
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
