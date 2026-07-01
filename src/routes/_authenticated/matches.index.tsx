import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { ArrowUpRight, Loader2, Radio } from "lucide-react";
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
  if (diff <= 0) return "Kicked off";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `Kicks off in ${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `Kicks off in ${h}h ${rm}m` : `Kicks off in ${h}h`;
  const d = Math.floor(h / 24);
  return `Kicks off in ${d}d ${h % 24}h`;
}

function abbreviate(name: string): string {
  return name.slice(0, 3).toUpperCase();
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
      } else if (kickoff > now && kickoff <= now + oneDay) {
        u.push(m);
      }
    }
    l.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    u.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [data, now]);

  const totalToday = live.length + upcoming.length;

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* atmospheric grain */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* stadium glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-[340px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.10) 0%, rgba(34,224,107,0.02) 40%, transparent 70%)",
        }}
      />

      <div
        className="relative mx-auto flex max-w-md flex-col gap-8 px-4 pt-6 md:max-w-2xl md:pt-10"
        style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom))" }}
      >
        {/* Header */}
        <header className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            Matchday
          </div>
          <h1 className="font-display text-[32px] font-bold leading-[1.02] tracking-tight md:text-5xl">
            World Cup <span className="text-[var(--color-neon)]">Markets</span>
          </h1>
          <p className="text-[12px] uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Round of 32{totalToday > 0 && <span> · {totalToday} fixture{totalToday === 1 ? "" : "s"}</span>}
          </p>
        </header>

        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <>
            {live.length > 0 && (
              <Section title="Live now" pulse>
                <div className="flex flex-col gap-3">
                  {live.map((m) => (
                    <MatchCard key={m.id} match={m} tone="live" now={now} />
                  ))}
                </div>
              </Section>
            )}

            {upcoming.length > 0 && (
              <Section title="Upcoming">
                <div className="flex flex-col gap-3">
                  {upcoming.map((m) => (
                    <MatchCard key={m.id} match={m} tone="upcoming" now={now} />
                  ))}
                </div>
              </Section>
            )}

            {completed.length > 0 && (
              <Section title="Completed">
                <div className="flex flex-col gap-3">
                  {completed.slice(0, 8).map((m) => (
                    <MatchCard key={m.id} match={m} tone="closed" now={now} />
                  ))}
                </div>
              </Section>
            )}

            {live.length === 0 && upcoming.length === 0 && completed.length === 0 && (
              <EmptyState />
            )}
          </>
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
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-neon)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--color-neon)]" />
          </span>
        )}
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          {title}
        </span>
        <span className="h-px flex-1 bg-gradient-to-r from-[var(--color-surface-border)] to-transparent" />
      </div>
      {children}
    </section>
  );
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

  const odds = match.reference_odds;
  const probs = useMemo(() => {
    if (!odds) return null;
    const raw = [1 / odds.home, 1 / odds.draw, 1 / odds.away];
    const sum = raw.reduce((a, b) => a + b, 0);
    if (!sum) return null;
    return {
      home: Math.round((raw[0] / sum) * 100),
      draw: Math.round((raw[1] / sum) * 100),
      away: Math.round((raw[2] / sum) * 100),
    };
  }, [odds]);

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      aria-label={`Open market for ${match.home_team} vs ${match.away_team}`}
      className={`group relative block overflow-hidden rounded-lg border bg-[var(--color-surface-2)] transition-all ${
        live
          ? "border-[var(--color-neon)]/40 shadow-[0_0_0_1px_rgba(34,224,107,0.08),0_10px_30px_-15px_rgba(34,224,107,0.3)]"
          : finished
            ? "border-[var(--color-surface-border)]/60 opacity-90"
            : "border-[var(--color-surface-border)] hover:border-[var(--color-neon)]/30"
      }`}
    >
      {/* live left ribbon */}
      {live && (
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-[var(--color-neon)] via-[var(--color-neon)]/60 to-transparent"
        />
      )}

      <div className="flex flex-col gap-4 px-4 py-4">
        {/* status row */}
        <div className="flex items-center justify-between">
          <span
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.22em] ${
              live
                ? "text-[var(--color-neon)]"
                : finished
                  ? "text-[var(--color-ink-muted)]"
                  : "text-[var(--color-ink-muted)]"
            }`}
          >
            {live && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon)]" />
            )}
            {statusLabel}
          </span>
          {finished && match.home_score != null && match.away_score != null ? (
            <span className="text-[13px] font-semibold tabular-nums text-[var(--color-ink)]">
              {match.home_score} – {match.away_score}
            </span>
          ) : (
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              {new Date(match.kickoff_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>

        {/* teams */}
        <div className="flex flex-col gap-2.5">
          <TeamRow name={match.home_team} flag={homeFlag} />
          <div className="flex items-center gap-2">
            <span className="h-px flex-1 bg-[var(--color-surface-border)]/60" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--color-ink-muted)]">
              vs
            </span>
            <span className="h-px flex-1 bg-[var(--color-surface-border)]/60" />
          </div>
          <TeamRow name={match.away_team} flag={awayFlag} />
        </div>

        {/* market estimate */}
        {probs && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-surface-border)]/60 bg-[var(--color-surface)]/50 px-3 py-2">
            <ProbCell label={abbreviate(match.home_team)} value={probs.home} />
            <span className="h-6 w-px bg-[var(--color-surface-border)]/60" />
            <ProbCell label="DRAW" value={probs.draw} />
            <span className="h-6 w-px bg-[var(--color-surface-border)]/60" />
            <ProbCell label={abbreviate(match.away_team)} value={probs.away} />
          </div>
        )}

        {/* CTA */}
        <div className="flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)]/70 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            {finished ? "View result" : "Open market"}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
              finished
                ? "text-[var(--color-ink-muted)] group-hover:text-[var(--color-ink)]"
                : "text-[var(--color-neon)]"
            }`}
          >
            {finished ? "Open" : "Predict"}
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TeamRow({ name, flag }: { name: string; flag: string | null }) {
  return (
    <div className="flex items-center gap-3">
      {flag ? (
        <img
          src={flag}
          alt=""
          className="h-6 w-8 rounded-sm object-cover shadow-[0_1px_3px_rgba(0,0,0,0.4)] ring-1 ring-black/40"
          loading="lazy"
        />
      ) : (
        <span className="grid h-6 w-8 place-items-center rounded-sm bg-[var(--color-surface-border)]/60 text-[9px] font-bold text-[var(--color-ink-muted)]">
          {name.slice(0, 2).toUpperCase()}
        </span>
      )}
      <span className="text-[15px] font-semibold leading-none tracking-tight text-[var(--color-ink)]">
        {name}
      </span>
    </div>
  );
}

function ProbCell({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
        {label}
      </span>
      <span className="text-[13px] font-semibold tabular-nums text-[var(--color-ink)]">
        {value}%
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-[var(--color-surface-border)] px-6 py-16 text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        No fixtures on the slate
      </p>
      <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
        Check back closer to kickoff.
      </p>
    </div>
  );
}
