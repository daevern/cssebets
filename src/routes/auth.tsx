import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkAuthRateLimit } from "@/lib/rate-limit.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { CsseAppIcon, CsseWordmark } from "@/components/brand/CsseMark";
import { TrendingUp, Users, Activity, Flame, ChevronRight } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — CSSEBets · Predict. Compete. Win." },
      {
        name: "description",
        content:
          "Join the CSSE prediction community and prove your strategy. Football predictions, leaderboards, and competitive leagues.",
      },
    ],
  }),
  component: LoginPage,
});

type Channel = "email" | "phone";

function normalizePhone(input: string) {
  return input.trim().replace(/\s+/g, "");
}
function isValidPhone(p: string) {
  if (!p.startsWith("+")) return false;
  const digits = p.slice(1).replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

/* ---------- Branded background: pitch + tactical overlays ---------- */
function BrandBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* base gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,oklch(0.78_0.19_145/0.18),transparent_55%),radial-gradient(circle_at_85%_85%,oklch(0.78_0.19_145/0.10),transparent_50%)]" />
      {/* tactical pitch + lines */}
      <svg
        viewBox="0 0 1200 800"
        className="absolute inset-0 h-full w-full opacity-[0.07]"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="1200" height="800" fill="url(#grid)" className="text-foreground" />
        {/* center circle + halfway */}
        <g className="text-primary" stroke="currentColor" strokeWidth="1.2" fill="none">
          <circle cx="600" cy="400" r="110" />
          <line x1="600" y1="80" x2="600" y2="720" />
          <rect x="80" y="240" width="180" height="320" />
          <rect x="940" y="240" width="180" height="320" />
        </g>
        {/* tactical arrows / passing lanes */}
        <g className="text-primary" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="6 6">
          <path d="M 180 600 Q 420 320 600 400" />
          <path d="M 600 400 Q 820 480 1020 220" />
          <path d="M 260 220 Q 480 380 700 300" />
        </g>
        {/* prediction ascent graph */}
        <polyline
          points="60,720 220,660 360,610 500,520 660,470 820,360 980,290 1140,180"
          className="text-primary"
          stroke="currentColor"
          strokeWidth="1.8"
          fill="none"
        />
      </svg>
      {/* vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-background/30 via-transparent to-background/80" />
    </div>
  );
}

/* ---------- Mock community/match data (login is public) ---------- */
const featuredMatch = {
  competition: "Premier League · Matchweek 38",
  kickoff: "Sun, 23:00",
  home: "Arsenal",
  away: "Man City",
  homeOdds: 2.4,
  drawOdds: 3.3,
  awayOdds: 2.6,
  poolPicks: 8421,
};

const trendingPick = {
  user: "tactician_07",
  pick: "Arsenal 2–1 Man City",
  confidence: 78,
};

const topPredictor = {
  name: "MidfieldMaestro",
  streak: 11,
  accuracy: 74,
};

const upcoming = [
  { league: "La Liga", match: "Real Madrid vs Barça", time: "Sat 22:00" },
  { league: "Serie A", match: "Inter vs Juventus", time: "Sun 20:45" },
  { league: "Bundesliga", match: "Bayern vs Dortmund", time: "Sat 18:30" },
];

function HeroPanel() {
  return (
    <div className="relative flex flex-col gap-6 text-foreground">
      <div className="flex items-center gap-3">
        <CsseAppIcon size={44} />
        <div className="flex flex-col leading-none">
          <CsseWordmark size={22} />
          <span className="mt-1 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Prediction Platform · Est. 2026
          </span>
        </div>
      </div>

      <div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
          Predict. <span className="text-primary">Compete.</span> Win.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          Join the CSSE prediction community and prove your strategy. Football intelligence,
          competitive leagues, and a leaderboard that rewards skill.
        </p>
      </div>

      {/* Featured match card */}
      <Card className="relative overflow-hidden border-primary/20 bg-card/70 p-4 backdrop-blur">
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Flame className="h-3 w-3 text-primary" />
            Featured Match
          </span>
          <span>{featuredMatch.kickoff}</span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0 text-right">
            <div className="truncate text-sm font-bold">{featuredMatch.home}</div>
            <div className="text-xs text-muted-foreground">Home · {featuredMatch.homeOdds}</div>
          </div>
          <div className="rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            VS
          </div>
          <div className="min-w-0 text-left">
            <div className="truncate text-sm font-bold">{featuredMatch.away}</div>
            <div className="text-xs text-muted-foreground">Away · {featuredMatch.awayOdds}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-xs text-muted-foreground">
          <span>{featuredMatch.competition}</span>
          <span className="flex items-center gap-1 font-medium text-foreground">
            <Users className="h-3 w-3" /> {featuredMatch.poolPicks.toLocaleString()} picks
          </span>
        </div>
      </Card>

      {/* Trending + top predictor */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="border-border/60 bg-card/60 p-3 backdrop-blur">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-primary" /> Trending Pick
          </div>
          <div className="text-sm font-semibold">{trendingPick.pick}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            @{trendingPick.user} · {trendingPick.confidence}% confidence
          </div>
        </Card>
        <Card className="border-border/60 bg-card/60 p-3 backdrop-blur">
          <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <Activity className="h-3 w-3 text-primary" /> Top Predictor
          </div>
          <div className="text-sm font-semibold">{topPredictor.name}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            {topPredictor.streak}-win streak · {topPredictor.accuracy}% accuracy
          </div>
        </Card>
      </div>

      {/* Community stats */}
      <div className="grid grid-cols-3 gap-3 rounded-xl border border-border/60 bg-card/50 p-4 backdrop-blur">
        <Stat label="Active predictors" value="12.4k" />
        <Stat label="Picks this week" value="48.7k" />
        <Stat label="Leagues running" value="320+" />
      </div>

      {/* Upcoming matches */}
      <div className="hidden sm:block">
        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
          Upcoming on CSSE
        </div>
        <ul className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/40 backdrop-blur">
          {upcoming.map((u) => (
            <li key={u.match} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{u.match}</div>
                <div className="text-[11px] text-muted-foreground">{u.league}</div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">{u.time}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-black text-foreground sm:text-2xl">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function LoginPage() {
  const [channel, setChannel] = useState<Channel>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (channel === "email") {
        await checkAuthRateLimit({ data: { email } });
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const p = normalizePhone(phone);
        if (!isValidPhone(p))
          throw new Error("Phone must be in international format, e.g. +60123456789");
        await checkAuthRateLimit({ data: { phone: p } });
        const syntheticEmail = `${p.replace(/\D/g, "")}@phone.cssebets.local`;
        const { error } = await supabase.auth.signInWithPassword({
          email: syntheticEmail,
          password,
        });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-background">
      <BrandBackdrop />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 lg:grid lg:grid-cols-[1.1fr_minmax(0,420px)] lg:items-center lg:gap-12 lg:py-12">
        {/* Hero (mobile: top, desktop: left) */}
        <section className="order-1">
          <HeroPanel />
        </section>

        {/* Login card */}
        <section className="order-2">
          <Card className="w-full space-y-5 border-border/70 bg-card/85 p-6 shadow-2xl backdrop-blur-md sm:p-8">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.22em] text-primary">
                Member sign in
              </span>
              <h2 className="text-xl font-bold">Welcome back, predictor.</h2>
              <p className="text-xs text-muted-foreground">
                Resume your streak and lock in this week's picks.
              </p>
            </div>

            <div className="flex gap-2 rounded-lg bg-muted/60 p-1">
              {(["email", "phone"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setChannel(c)}
                  className={`flex-1 rounded-md py-1.5 text-xs font-medium transition ${
                    channel === c ? "bg-card shadow" : "text-muted-foreground"
                  }`}
                >
                  {c === "email" ? "Email" : "Phone"}
                </button>
              ))}
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              {channel === "email" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    required
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+60123456789"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    International format, e.g. +60123456789
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Please wait…" : "Sign in & make a pick"}
                {!loading && <ChevronRight className="ml-1 h-4 w-4" />}
              </Button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">New to CSSE?</span>
              </div>
            </div>

            <Link to="/register" className="block">
              <Button type="button" variant="outline" className="w-full">
                Create a predictor account
              </Button>
            </Link>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <Link to="/" className="hover:text-foreground">
                ← Back home
              </Link>
              <span className="flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                Live · 1,284 predictors online
              </span>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
