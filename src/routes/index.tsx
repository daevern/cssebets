import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoneyRainBg } from "@/components/MoneyRainBg";
import { getLandingData, type LandingMatch } from "@/lib/landing.functions";
import {
  Trophy,
  Flame,
  Activity,
  Users,
  Coins,
  Radio,
  ChevronRight,
  Zap,
} from "lucide-react";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "CSSEBets — Live World Cup 2026 Odds & Betting" },
      {
        name: "description",
        content:
          "Bet live on the FIFA World Cup 2026. Real-time odds, leaderboards, instant payouts. Join the action.",
      },
      { property: "og:title", content: "CSSEBets — Live World Cup 2026 Action" },
      {
        property: "og:description",
        content: "Live odds, top winners, and World Cup 2026 matches in one place.",
      },
    ],
  }),
  component: LandingPage,
});

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

  const fetchLanding = useServerFn(getLandingData);
  const { data } = useQuery({
    queryKey: ["landing"],
    queryFn: () => fetchLanding(),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const primaryCta = authed
    ? { to: "/dashboard", label: "Go to Dashboard" }
    : { to: "/auth", label: "Sign In / Join" };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav primaryCta={primaryCta} />
      <Hero primaryCta={primaryCta} data={data} />
      <LiveTicker matches={[...(data?.liveMatches ?? []), ...(data?.upcomingMatches ?? [])].slice(0, 12)} />
      <FeaturedMatches
        live={data?.liveMatches ?? []}
        upcoming={data?.upcomingMatches ?? []}
      />
      <StatsLeaderboard
        stats={data?.stats}
        topWinners={data?.topWinners ?? []}
        recentResults={data?.recentResults ?? []}
      />
      <FinalCta primaryCta={primaryCta} />
    </div>
  );
}

/* ---------------- TOP NAV ---------------- */
function TopNav({ primaryCta }: { primaryCta: { to: string; label: string } }) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-black tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-emerald-500 text-primary-foreground shadow-lg shadow-primary/30">
            <Trophy className="h-4 w-4" />
          </span>
          <span className="text-base">CSSE<span className="text-primary">Bets</span></span>
        </Link>
        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="gap-1.5 border-destructive/50 bg-destructive/10 text-destructive">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
            </span>
            LIVE
          </Badge>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">World Cup 2026</span>
        </div>
        <Link to={primaryCta.to}>
          <Button size="sm" className="gap-1 font-bold">
            {primaryCta.label}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </header>
  );
}

/* ---------------- HERO ---------------- */
function Hero({
  primaryCta,
  data,
}: {
  primaryCta: { to: string; label: string };
  data: ReturnType<typeof useQuery>["data"] extends infer T ? T : never;
}) {
  const nextKickoff = data?.upcomingMatches?.[0]?.kickoff_at ?? data?.liveMatches?.[0]?.kickoff_at;

  return (
    <section className="relative isolate overflow-hidden border-b border-border">
      {/* Glow */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(50% 60% at 50% 0%, color-mix(in oklab, var(--primary) 35%, transparent), transparent 70%), radial-gradient(40% 50% at 80% 20%, color-mix(in oklab, var(--warning) 18%, transparent), transparent 70%)",
        }}
      />
      {/* Field grid */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(var(--foreground) 1px, transparent 1px), linear-gradient(90deg, var(--foreground) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <MoneyRainBg count={28} spawnMs={9000} />

      <div className="relative mx-auto max-w-7xl px-4 pt-12 pb-16 sm:pt-16 sm:pb-20">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-primary">
            <Flame className="h-3.5 w-3.5" />
            FIFA World Cup · Live Now
          </div>
          <h1 className="mx-auto max-w-4xl text-5xl font-black tracking-tighter sm:text-7xl">
            BET THE <span className="bg-gradient-to-r from-primary via-emerald-400 to-warning bg-clip-text text-transparent">WORLD CUP</span>
            <br />
            LIVE. EVERY MATCH.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
            Real-time odds. Real winners. One platform.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to={primaryCta.to}>
              <Button size="lg" className="h-12 gap-2 px-6 text-base font-bold shadow-lg shadow-primary/30">
                <Zap className="h-5 w-5" />
                {primaryCta.label}
              </Button>
            </Link>
            <a href="#matches">
              <Button size="lg" variant="outline" className="h-12 px-6 text-base font-bold">
                View Live Matches
              </Button>
            </a>
          </div>

          {nextKickoff && <CountdownPill kickoffAt={nextKickoff} />}

          <StatsRow stats={data?.stats} />
        </motion.div>
      </div>
    </section>
  );
}

function CountdownPill({ kickoffAt }: { kickoffAt: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, new Date(kickoffAt).getTime() - now);
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  const isLive = diff <= 0;

  return (
    <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-border bg-card/70 px-4 py-3 backdrop-blur">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {isLive ? "Match in progress" : "Next kickoff"}
      </span>
      {!isLive && (
        <div className="flex items-center gap-1.5 font-mono text-lg font-black tabular-nums">
          <TimeBox label="D" value={d} />
          <span className="text-primary">:</span>
          <TimeBox label="H" value={h} />
          <span className="text-primary">:</span>
          <TimeBox label="M" value={m} />
          <span className="text-primary">:</span>
          <TimeBox label="S" value={s} />
        </div>
      )}
      {isLive && (
        <span className="rounded-md bg-destructive px-2 py-0.5 text-xs font-bold text-destructive-foreground">
          LIVE
        </span>
      )}
    </div>
  );
}

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="rounded-md bg-secondary px-2 py-1 text-base leading-none">
        {String(value).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function StatsRow({ stats }: { stats?: { totalMatches: number; totalBets: number; totalPlayers: number; totalPayouts: number } }) {
  const items = [
    { icon: Activity, label: "Matches", value: stats?.totalMatches ?? 0 },
    { icon: Coins, label: "Bets Placed", value: stats?.totalBets ?? 0 },
    { icon: Users, label: "Players", value: stats?.totalPlayers ?? 0 },
    { icon: Trophy, label: "Points Paid", value: Math.round(stats?.totalPayouts ?? 0) },
  ];
  return (
    <div className="mx-auto mt-10 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((it) => (
        <motion.div
          key={it.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-xl border border-border bg-card/60 p-3 backdrop-blur"
        >
          <div className="flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            <it.icon className="h-3.5 w-3.5" />
            {it.label}
          </div>
          <div className="mt-1 text-2xl font-black tabular-nums">
            <CountUp value={Number(it.value)} />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function CountUp({ value, duration = 900 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setN(Math.round(from + (value - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString()}</>;
}

/* ---------------- LIVE TICKER ---------------- */
function LiveTicker({ matches }: { matches: LandingMatch[] }) {
  if (!matches.length) return null;
  const items = [...matches, ...matches];
  return (
    <div className="relative overflow-hidden border-b border-border bg-card/40">
      <div className="flex items-center gap-2 border-b border-border/60 bg-background/60 px-4 py-2">
        <Radio className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Live Odds Feed
        </span>
      </div>
      <div className="relative">
        <div
          className="flex w-max gap-6 whitespace-nowrap py-3 pr-6"
          style={{ animation: "ticker 60s linear infinite" }}
        >
          {items.map((m, i) => (
            <div key={`${m.id}-${i}`} className="flex items-center gap-3 text-xs">
              <span className="font-semibold">{m.home_team}</span>
              <OddsChip value={m.reference_odds?.home} />
              <OddsChip value={m.reference_odds?.draw} label="X" />
              <OddsChip value={m.reference_odds?.away} />
              <span className="font-semibold">{m.away_team}</span>
              <span className="text-muted-foreground">·</span>
            </div>
          ))}
        </div>
      </div>
      <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}

function OddsChip({ value, label }: { value?: number; label?: string }) {
  if (!value) return <span className="rounded bg-secondary px-1.5 py-0.5 text-muted-foreground">—</span>;
  return (
    <span className="rounded bg-primary/15 px-1.5 py-0.5 font-mono font-bold text-primary">
      {label ? `${label} ` : ""}
      {value.toFixed(2)}
    </span>
  );
}

/* ---------------- FEATURED MATCHES ---------------- */
function FeaturedMatches({
  live,
  upcoming,
}: {
  live: LandingMatch[];
  upcoming: LandingMatch[];
}) {
  const all = [...live, ...upcoming].slice(0, 6);
  if (!all.length) return null;
  return (
    <section id="matches" className="border-b border-border">
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
              World Cup 2026
            </div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl">
              Bet The Action
            </h2>
          </div>
          <Link to="/auth" className="hidden text-sm font-bold text-primary hover:underline sm:inline-flex">
            All matches <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {all.map((m, i) => (
            <MatchCard key={m.id} match={m} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function MatchCard({ match, index }: { match: LandingMatch; index: number }) {
  const isLive = match.status === "live";
  const kick = useMemo(() => new Date(match.kickoff_at), [match.kickoff_at]);
  const odds = match.reference_odds;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-0 blur-3xl transition group-hover:opacity-60"
        style={{ background: "color-mix(in oklab, var(--primary) 50%, transparent)" }}
      />
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest">
        {isLive ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-2 py-0.5 text-destructive">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
            </span>
            Live Now
          </span>
        ) : (
          <span className="text-muted-foreground">
            {kick.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {kick.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        <span className="truncate text-muted-foreground/70">{(match.stage ?? "").split("·").pop()?.trim()}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <TeamBadge name={match.home_team} crest={match.home_crest} />
        <div className="text-center">
          {isLive && match.home_score != null ? (
            <div className="font-mono text-2xl font-black tabular-nums">
              {match.home_score}<span className="px-1 text-muted-foreground">-</span>{match.away_score}
            </div>
          ) : (
            <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">VS</div>
          )}
        </div>
        <TeamBadge name={match.away_team} crest={match.away_crest} align="right" />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <OddsButton label="1" team={match.home_team} value={odds?.home} />
        <OddsButton label="X" team="Draw" value={odds?.draw} />
        <OddsButton label="2" team={match.away_team} value={odds?.away} />
      </div>
    </motion.div>
  );
}

function TeamBadge({ name, crest, align = "left" }: { name: string; crest: string | null; align?: "left" | "right" }) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
      <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary text-xs font-black">
        {crest ? (
          <img src={crest} alt={name} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          name.slice(0, 2).toUpperCase()
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold">{name}</div>
      </div>
    </div>
  );
}

function OddsButton({ label, team, value }: { label: string; team: string; value?: number }) {
  return (
    <Link
      to="/auth"
      className="group/odds flex flex-col items-center justify-center rounded-lg border border-border bg-secondary/50 px-2 py-2 transition hover:border-primary/50 hover:bg-primary/10"
      aria-label={`Bet ${team}`}
    >
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground group-hover/odds:text-primary">
        {label}
      </span>
      <span className="font-mono text-base font-black tabular-nums text-foreground">
        {value ? value.toFixed(2) : "—"}
      </span>
    </Link>
  );
}

/* ---------------- STATS + LEADERBOARD ---------------- */
function StatsLeaderboard({
  stats,
  topWinners,
  recentResults,
}: {
  stats?: { totalMatches: number; totalBets: number; totalPlayers: number; totalPayouts: number };
  topWinners: { display_name: string; points: number }[];
  recentResults: LandingMatch[];
}) {
  return (
    <section className="border-b border-border bg-card/20">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-12 lg:grid-cols-2">
        {/* Top winners */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" />
              <h3 className="text-lg font-black tracking-tight">Top Winners</h3>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              All time
            </span>
          </div>
          {topWinners.length ? (
            <ol className="space-y-2">
              {topWinners.map((w, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`grid h-7 w-7 place-items-center rounded-full text-xs font-black ${
                        i === 0
                          ? "bg-warning text-warning-foreground"
                          : i === 1
                          ? "bg-muted text-foreground"
                          : i === 2
                          ? "bg-accent text-accent-foreground"
                          : "bg-secondary text-foreground"
                      }`}
                    >
                      {i + 1}
                    </span>
                    <span className="font-bold">{w.display_name}</span>
                  </div>
                  <span className="font-mono font-black tabular-nums text-primary">
                    +{Math.round(w.points).toLocaleString()}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">Be the first to make the board.</p>
          )}
        </div>

        {/* Recent results */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="text-lg font-black tracking-tight">Latest Results</h3>
          </div>
          {recentResults.length ? (
            <ul className="space-y-2">
              {recentResults.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-sm"
                >
                  <span className="truncate font-semibold">{m.home_team}</span>
                  <span className="mx-3 rounded-md bg-background px-2 py-0.5 font-mono font-black tabular-nums">
                    {m.home_score ?? 0} - {m.away_score ?? 0}
                  </span>
                  <span className="truncate text-right font-semibold">{m.away_team}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Results will appear as matches finish.</p>
          )}
          {stats && (
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border pt-4">
              <MiniStat label="Total matches" value={stats.totalMatches} />
              <MiniStat label="Bets placed" value={stats.totalBets} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-black tabular-nums">
        <CountUp value={value} />
      </div>
    </div>
  );
}

/* ---------------- FINAL CTA + FOOTER ---------------- */
function FinalCta({ primaryCta }: { primaryCta: { to: string; label: string } }) {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(60% 80% at 50% 100%, color-mix(in oklab, var(--primary) 30%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mx-auto max-w-4xl px-4 py-16 text-center">
          <h2 className="text-3xl font-black tracking-tighter sm:text-5xl">
            The World Cup is happening. <br />
            <span className="bg-gradient-to-r from-primary to-warning bg-clip-text text-transparent">
              Don't watch from the sidelines.
            </span>
          </h2>
          <div className="mt-6">
            <Link to={primaryCta.to}>
              <Button size="lg" className="h-12 gap-2 px-8 text-base font-bold shadow-lg shadow-primary/30">
                <Zap className="h-5 w-5" />
                {primaryCta.label}
              </Button>
            </Link>
          </div>
        </div>
      </section>
      <footer className="bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-bold text-foreground">
            <Trophy className="h-4 w-4 text-primary" />
            CSSEBets
          </div>
          <div className="flex gap-4">
            <a href="mailto:support@cssebets.com" className="hover:text-foreground">support@cssebets.com</a>
            <span>WhatsApp +60 11 142 11004</span>
          </div>
          <span>© {new Date().getFullYear()} CSSEBets</span>
        </div>
      </footer>
    </>
  );
}
