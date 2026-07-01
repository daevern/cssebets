import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/matches/")({
  head: () => ({ meta: [{ title: "Matchday — cssebets" }] }),
  component: MatchesPage,
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
  group_name: string | null;
  reference_odds: { home: number; draw: number; away: number } | null;
  odds_updated_at: string | null;
  odds_source: string | null;
  odds_status?: string | null;
  suspended_markets?: string[] | null;
  manual_override?: boolean | null;
};

function useTicker(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatKickoff(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  const d = new Date(iso);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff <= 0) return `${dateStr} · ${timeStr}`;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `Kicks off in ${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 12) return rm ? `Kicks off in ${h}h ${rm}m` : `Kicks off in ${h}h`;
  return `${dateStr} · ${timeStr}`;
}

function MatchesPage() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesForUsers);
  const now = useTicker(30_000);

  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => {
      const rows = await listMatches();
      return rows as Match[];
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel("matches-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => {
        qc.invalidateQueries({ queryKey: ["matches"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc]);

  const { live, upcoming, completed } = useMemo(() => {
    const l: Match[] = [];
    const u: Match[] = [];
    const c: Match[] = [];
    const oneDay = 24 * 60 * 60 * 1000;
    const threeHours = 3 * 60 * 60 * 1000;

    for (const m of data ?? []) {
      const kickoff = new Date(m.kickoff_at).getTime();
      if (m.status === "live" || (m.status !== "finished" && kickoff <= now && kickoff >= now - threeHours)) {
        l.push(m);
      } else if (m.status === "finished") {
        c.push(m);
      } else if (kickoff > now && kickoff <= now + oneDay * 3) {
        u.push(m);
      }
    }
    l.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    u.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [data, now]);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* subtle brand grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-neon) 1px, transparent 1px), linear-gradient(90deg, var(--color-neon) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* soft top bloom */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[280px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% -10%, color-mix(in oklab, var(--color-neon) 8%, transparent) 0%, transparent 60%)",
        }}
      />

      <div
        className="relative mx-auto flex max-w-md flex-col gap-8 px-4 pt-8 md:max-w-2xl md:pt-12"
        style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom))" }}
      >
        {/* Header — quiet, confident */}
        <header className="flex flex-col gap-1.5">
          <div className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
            Sports · Soccer
          </div>
          <h1 className="font-display text-[28px] font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-4xl">
            World Cup
          </h1>
          <div className="text-[11px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
            FIFA World Cup · Round of 32
          </div>
        </header>

        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-8">
            {live.length > 0 && (
              <Section title="Live" pulse>
                {live.map((m) => <MatchCard key={m.id} match={m} tone="live" now={now} />)}
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="Upcoming">
                {upcoming.map((m) => <MatchCard key={m.id} match={m} tone="upcoming" now={now} />)}
              </Section>
            )}
            {completed.length > 0 && (
              <Section title="Completed">
                {completed.slice(0, 8).map((m) => <MatchCard key={m.id} match={m} tone="closed" now={now} />)}
              </Section>
            )}
            {live.length === 0 && upcoming.length === 0 && completed.length === 0 && <EmptyState />}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, pulse, children }: { title: string; pulse?: boolean; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        {pulse && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
          </span>
        )}
        <span className={`text-[10px] font-semibold uppercase tracking-[0.24em] ${pulse ? "text-destructive" : "text-[var(--color-ink-muted)]"}`}>
          {title}
        </span>
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </section>
  );
}

function computeSideChances(odds: Match["reference_odds"]): { home: number; away: number } | null {
  if (!odds || !odds.home || !odds.away || !odds.draw) return null;
  const raw = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
  const sum = raw.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  // Fold draw into each side (advance-style)
  const home = (raw[0] + raw[1] / 2) / sum;
  const away = (raw[2] + raw[1] / 2) / sum;
  return { home: Math.round(home * 100), away: Math.round(away * 100) };
}

function MatchCard({ match, tone, now }: { match: Match; tone: "live" | "upcoming" | "closed"; now: number }) {
  const homeFlag = teamFlagUrl(match.home_team, 80);
  const awayFlag = teamFlagUrl(match.away_team, 80);
  const finished = tone === "closed";
  const live = tone === "live";

  const statusLabel = live
    ? "LIVE"
    : finished
      ? "Full time"
      : formatKickoff(match.kickoff_at, now);

  const chances = useMemo(() => computeSideChances(match.reference_odds), [match.reference_odds]);
  const hScore = match.home_score;
  const aScore = match.away_score;
  const showScore = (live && (hScore != null || aScore != null)) || finished;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      aria-label={`Open market for ${match.home_team} vs ${match.away_team}`}
      className={`group relative block overflow-hidden rounded-xl border bg-[var(--color-surface-2)]/70 backdrop-blur-sm transition-all ${
        live
          ? "border-destructive/30 hover:border-destructive/50"
          : finished
            ? "border-[var(--color-surface-border)]/50 opacity-80 hover:opacity-100"
            : "border-[var(--color-surface-border)]/70 hover:border-[var(--color-neon)]/40"
      }`}
    >
      <div className="flex flex-col gap-3.5 px-4 py-3.5">
        {/* status row */}
        <div className="flex items-center justify-between">
          <span className="truncate text-[15px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
            {match.home_team} <span className="text-[var(--color-ink-muted)]">vs</span> {match.away_team}
          </span>
          <span
            className={`shrink-0 pl-3 text-[10px] font-semibold uppercase tracking-[0.2em] ${
              live ? "text-destructive" : finished ? "text-[var(--color-ink-muted)]" : "text-[var(--color-ink-muted)]"
            }`}
          >
            {live && (
              <span className="mr-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-destructive align-middle" />
            )}
            {statusLabel}
          </span>
        </div>

        {/* team market rows */}
        <div className="flex flex-col gap-1.5">
          <TeamMarketRow
            name={match.home_team}
            flag={homeFlag}
            score={showScore ? hScore : null}
            multiplier={!showScore ? match.reference_odds?.home : null}
            chance={chances?.home}
            emphasis={live || finished}
          />
          <TeamMarketRow
            name={match.away_team}
            flag={awayFlag}
            score={showScore ? aScore : null}
            multiplier={!showScore ? match.reference_odds?.away : null}
            chance={chances?.away}
            emphasis={live || finished}
          />
        </div>

        {/* footer */}
        <div className="flex items-center justify-between pt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          <span>{finished ? "Result" : "Prediction market"}</span>
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              finished ? "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]" : "text-[var(--color-neon)]"
            }`}
          >
            Open Market
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TeamMarketRow({
  name,
  flag,
  score,
  multiplier,
  chance,
  emphasis,
}: {
  name: string;
  flag: string | null;
  score: number | null;
  multiplier: number | null | undefined;
  chance: number | undefined;
  emphasis: boolean;
}) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded-md border border-transparent bg-[var(--color-surface)]/40 px-2.5 py-2 transition-colors hover:border-[var(--color-surface-border)]/60">
      {flag ? (
        <img
          src={flag}
          alt=""
          className="h-5 w-7 rounded-sm object-cover ring-1 ring-black/40"
          loading="lazy"
        />
      ) : (
        <span className="grid h-5 w-7 place-items-center rounded-sm bg-[var(--color-surface-border)]/50 text-[9px] font-semibold text-[var(--color-ink-muted)]">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
        {name} <span className="font-normal text-[var(--color-ink-muted)]">advances</span>
      </span>
      <span className={`w-10 text-right text-[12px] font-semibold tabular-nums ${emphasis ? "text-[var(--color-ink)]" : "text-[var(--color-ink-muted)]"}`}>
        {score != null ? score : multiplier ? `${multiplier.toFixed(2)}x` : "—"}
      </span>
      <span className="w-11 text-right text-[12px] font-semibold tabular-nums text-[var(--color-neon)]">
        {chance != null ? `${chance}%` : ""}
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-surface-border)] px-6 py-16 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        No fixtures on the slate
      </p>
      <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
        Check back closer to kickoff.
      </p>
    </div>
  );
}
