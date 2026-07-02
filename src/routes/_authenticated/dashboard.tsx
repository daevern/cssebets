import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { SVGProps } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronRight, Ticket, Flame, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Matchday — CSSEBets" },
      { name: "description", content: "Today's featured football markets. Open a market and lock your prediction." },
    ],
  }),
  component: HomePage,
});

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  stage: string | null;
  reference_odds: { home: number; draw: number; away: number } | null;
};

function useTicker(ms = 30_000) {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

function toPct(odds: { home: number; draw: number; away: number } | null) {
  if (!odds) return null;
  const inv = { h: 1 / odds.home, d: 1 / odds.draw, a: 1 / odds.away };
  const s = inv.h + inv.d + inv.a;
  return {
    home: Math.round((inv.h / s) * 100),
    draw: Math.round((inv.d / s) * 100),
    away: Math.round((inv.a / s) * 100),
  };
}

function TeamFlag({ name, size = 56 }: { name: string; size?: number }) {
  const url = teamFlagUrl(name, 320);
  if (!url) {
    return (
      <div
        className="grid place-items-center bg-[var(--surface-3)] text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
        style={{ width: size, height: size * 0.7 }}
      >
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="object-cover"
      style={{ width: size, height: size * 0.72 }}
      loading="lazy"
    />
  );
}

function statusLabel(m: Match, now: number) {
  if (m.status === "live") return "LIVE";
  if (m.status === "finished") return "Full time";
  const diff = new Date(m.kickoff_at).getTime() - now;
  if (diff <= 0) return "Starting";
  const d = new Date(m.kickoff_at);
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const h = d.getHours() % 12 || 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")}${d.getHours() >= 12 ? "PM" : "AM"}`;
  return sameDay ? `Today · ${time}` : `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${time}`;
}

function HomePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMatchesForUsers);
  const now = useTicker(30_000);
  const { user } = useAuth();
  const uid = user?.id;

  const { data } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await listFn()) as Match[],
    refetchInterval: 60_000,
  });

  const { data: picks } = useQuery({
    queryKey: ["dashboard-active-picks", uid],
    enabled: !!uid,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("id, status, points, virtual_stake, potential_return")
        .eq("user_id", uid!)
        .eq("status", "pending");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string; status: string; points: number; virtual_stake: number; potential_return: number;
      }>;
    },
  });

  const { data: historyCount = 0 } = useQuery({
    queryKey: ["dashboard-history-count", uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid!)
        .neq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const stakeOf = (p: { points: number; virtual_stake: number }) =>
    Number(p.virtual_stake ?? 0) || Number(p.points ?? 0);
  const liveCount = picks?.length ?? 0;
  const totalRisked = picks?.reduce((s, p) => s + stakeOf(p), 0) ?? 0;
  const expectedPayout = picks?.reduce((s, p) => s + Number(p.potential_return ?? 0), 0) ?? 0;
  const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

  useEffect(() => {
    const ch = supabase
      .channel("home-matches")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () =>
        qc.invalidateQueries({ queryKey: ["matches"] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const { featured, trending } = useMemo(() => {
    const arr = data ?? [];
    const live = arr.filter((m) => m.status === "live");
    const upcoming = arr
      .filter((m) => m.status !== "finished" && new Date(m.kickoff_at).getTime() > now)
      .sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    const featured = live[0] ?? upcoming[0] ?? null;
    const trending = [
      ...live,
      ...upcoming.slice(0, 6),
    ]
      .filter((m) => m.id !== featured?.id)
      .slice(0, 8);
    return { featured, trending };
  }, [data, now]);

  return (
    <div className="flex flex-col gap-8 px-4 pt-5">
      {/* Header */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="font-display text-[38px] font-bold leading-none tracking-tight text-[var(--ink)]">
            Matchday
          </h1>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
            <span className="text-[13px]">🌐</span>
            FIFA World Cup 2026
            <ChevronRight className="h-3 w-3" />
          </div>
        </div>
        <Link
          to="/matches"
          className="flex items-center gap-1 rounded-full border border-[var(--color-surface-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--ink-muted)] transition-colors hover:border-[var(--neon)]/50 hover:text-[var(--ink)]"
        >
          See all fixtures
          <ChevronRight className="h-3 w-3" />
        </Link>
      </header>

      {/* Featured match hero */}
      {featured ? (
        <FeaturedHero match={featured} now={now} />
      ) : (
        <div className="rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-10 text-center text-sm text-[var(--ink-muted)]">
          No fixtures on the slate yet — check back closer to kickoff.
        </div>
      )}

      {/* Live & Trending */}
      {trending.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-[var(--ink)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
                Live & Trending
              </h2>
              <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Markets with the most action right now.</p>
            </div>
            <Link
              to="/matches"
              className="flex items-center gap-1 text-[12px] font-semibold text-[var(--neon)]"
            >
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {trending.map((m) => (
              <TrendingChip key={m.id} match={m} now={now} />
            ))}
          </div>
        </section>
      )}

      {/* Featured shortcuts */}
      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-bold tracking-tight text-[var(--ink)]">Featured</h2>
          <p className="mt-0.5 text-[12px] text-[var(--ink-muted)]">Explore top markets and upcoming fixtures.</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <ShortcutTile icon={<Trophy className="h-4 w-4" />} title="World Cup 2026" sub="All markets" to="/matches" />
          <ShortcutTile icon={<Flame className="h-4 w-4" />} title="Popular" sub="High activity" to="/matches" />
          <ShortcutTile icon={<Clock className="h-4 w-4" />} title="Upcoming" sub="Next 24h" to="/matches" />
          <ShortcutTile icon={<Star className="h-4 w-4" />} title="Specials" sub="Curated picks" to="/matches" />
        </div>
      </section>
    </div>
  );
}

function FeaturedHero({ match, now }: { match: Match; now: number }) {
  const live = match.status === "live";
  const pct = toPct(match.reference_odds);
  const status = statusLabel(match, now);

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="group relative block overflow-hidden rounded-2xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] transition-colors hover:border-[var(--neon)]/40"
    >
      {/* Ambient stadium glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(34,224,107,0.10), transparent 60%)",
        }}
      />

      <div className="relative flex flex-col gap-5 p-5">
        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em]">
          {live ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--neon)] opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
              </span>
              <span className="text-[var(--neon)]">LIVE</span>
              <span className="text-[var(--ink-muted)]">·</span>
              <span className="text-[var(--ink-muted)]">2nd Half · 68'</span>
            </>
          ) : (
            <span className="text-[var(--ink-muted)]">{status}</span>
          )}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center gap-2">
            <TeamFlag name={match.home_team} size={80} />
            <span className="text-[13px] font-bold tracking-tight text-center">{match.home_team}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {live || match.status === "finished" ? (
              <div className="font-display text-[38px] font-bold leading-none tabular-nums text-[var(--ink)]">
                {match.home_score ?? 0} <span className="mx-0.5 text-[var(--ink-muted)]">-</span> {match.away_score ?? 0}
              </div>
            ) : (
              <div className="font-display text-[26px] font-bold leading-none text-[var(--ink-muted)]">vs</div>
            )}
          </div>
          <div className="flex flex-col items-center gap-2">
            <TeamFlag name={match.away_team} size={80} />
            <span className="text-[13px] font-bold tracking-tight text-center">{match.away_team}</span>
          </div>
        </div>

        {/* Probability strip */}
        {pct && match.reference_odds && (
          <div className="grid grid-cols-3 divide-x divide-[var(--color-surface-border)] rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-3)]/60 py-3 text-center">
            <ProbCell label={match.home_team} pct={pct.home} mult={match.reference_odds.home} tone="home" />
            <ProbCell label="Draw" pct={pct.draw} mult={match.reference_odds.draw} tone="draw" />
            <ProbCell label={match.away_team} pct={pct.away} mult={match.reference_odds.away} tone="away" />
          </div>
        )}

        <div className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-[var(--neon)] py-3.5 text-[15px] font-bold tracking-tight text-[#04140A] transition-transform group-hover:translate-y-[-1px]">
          Open Market
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}

function ProbCell({
  label,
  pct,
  mult,
  tone,
}: {
  label: string;
  pct: number;
  mult: number;
  tone: "home" | "draw" | "away";
}) {
  const color =
    tone === "home" ? "text-rose-400" : tone === "away" ? "text-[var(--neon)]" : "text-sky-300";
  return (
    <div className="px-1">
      <div className="truncate text-[11px] font-semibold text-[var(--ink)]">{label}</div>
      <div className={`mt-0.5 text-[18px] font-bold leading-none tabular-nums ${color}`}>{pct}%</div>
      <div className="mt-1 text-[10px] tabular-nums text-[var(--ink-muted)]">{mult.toFixed(2)}x</div>
    </div>
  );
}

function TrendingChip({ match, now }: { match: Match; now: number }) {
  const live = match.status === "live";
  const pct = toPct(match.reference_odds);
  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className={`shrink-0 rounded-xl border bg-[var(--surface-2)] px-3 py-3 transition-colors ${
        live ? "border-[var(--neon)]/40" : "border-[var(--color-surface-border)]"
      } hover:border-[var(--neon)]/50`}
      style={{ width: 148 }}
    >
      <div className="flex items-center gap-1.5">
        <TeamFlag name={match.home_team} size={26} />
        <span className="text-[10px] font-bold text-[var(--ink-muted)]">·</span>
        <TeamFlag name={match.away_team} size={26} />
      </div>
      <div className="mt-2 text-[12px] font-bold tracking-tight text-[var(--ink)]">
        {abbrev(match.home_team)} vs {abbrev(match.away_team)}
      </div>
      {live ? (
        <div className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--neon)]">
          <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--neon)]" /> LIVE
        </div>
      ) : pct ? (
        <div className="mt-1 flex items-center gap-1.5 text-[11px] tabular-nums">
          <span className="text-rose-400 font-semibold">{pct.home}%</span>
          <span className="text-[var(--ink-dim)]">·</span>
          <span className="text-[var(--neon)] font-semibold">{pct.away}%</span>
        </div>
      ) : (
        <div className="mt-1 text-[10px] text-[var(--ink-muted)]">{statusLabel(match, now)}</div>
      )}
    </Link>
  );
}

function abbrev(name: string) {
  const stops: Record<string, string> = {
    "United States": "USA", "United Kingdom": "UK", "Bosnia & Herzegovina": "BIH",
  };
  if (stops[name]) return stops[name];
  return name.length <= 4 ? name.toUpperCase() : name.slice(0, 3).toUpperCase();
}

function ShortcutTile({
  icon,
  title,
  sub,
  to,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="group flex flex-col justify-between rounded-xl border border-[var(--color-surface-border)] bg-[var(--surface-2)] p-4 transition-colors hover:border-[var(--neon)]/40"
    >
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--surface-3)] text-[var(--neon)]">
        {icon}
      </div>
      <div className="mt-3">
        <div className="text-[14px] font-bold tracking-tight text-[var(--ink)]">{title}</div>
        <div className="mt-0.5 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
          <span>{sub}</span>
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}
