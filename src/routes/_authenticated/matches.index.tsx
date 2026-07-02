import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { teamFlagUrl } from "@/lib/country-flags";
import { Clock, Loader2, Radio } from "lucide-react";
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

function useTicker(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function formatCountdown(ms: number) {
  if (ms <= 0) return "Live / starting";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (days > 0) return `${days}d ${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatKickoffDate(iso: string): string {
  const d = new Date(iso);
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()} ${hours}:${minutes}${ampm}`;
}

function MatchesPage() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesForUsers);
  const now = useTicker(1000);

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
    const threeHours = 3 * 60 * 60 * 1000;

    for (const m of data ?? []) {
      const kickoff = new Date(m.kickoff_at).getTime();
      if (m.status === "live" || (m.status !== "finished" && kickoff <= now && kickoff >= now - threeHours)) {
        l.push(m);
      } else if (m.status === "finished") {
        c.push(m);
      } else if (kickoff > now) {
        u.push(m);
      }
    }
    l.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    u.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { live: l, upcoming: u, completed: c };
  }, [data, now]);

  return (
    <div className="relative min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard scanline */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* Neon stadium wash */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[320px]"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, rgba(34,224,107,0.14), transparent 60%)",
        }}
      />

      <div
        className="relative mx-auto flex max-w-4xl flex-col gap-8 px-4 pt-8 md:pt-12"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom))" }}
      >
        {/* Header */}
        <header className="flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 border border-[var(--color-neon)]/40 bg-[var(--color-neon)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            FIFA World Cup 2026
          </div>
          <h1 className="mt-4 font-display text-[32px] font-bold uppercase leading-[0.95] tracking-tight sm:text-[44px]">
            Matchday <span className="text-[var(--color-neon)]">Console</span>
          </h1>
          <p className="mt-2 font-display text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-ink-muted)]">
            Round of 32 · Lock in your predictions
          </p>
        </header>

        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data?.length ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-10">
            {live.length > 0 && (
              <Section title="Live" pulse>
                <FixtureGrid matches={live} tone="live" now={now} />
              </Section>
            )}
            {upcoming.length > 0 && (
              <Section title="Upcoming">
                <FixtureGrid matches={upcoming} tone="upcoming" now={now} />
              </Section>
            )}
            {completed.length > 0 && (
              <Section title="Completed">
                <FixtureGrid matches={completed.slice(0, 8)} tone="closed" now={now} />
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
    <section className="space-y-4">
      <div className="flex items-center gap-2 border-b border-dashed border-[var(--color-surface-border)] pb-2">
        {pulse && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
          </span>
        )}
        <span className={`font-display text-[10px] font-bold uppercase tracking-[0.32em] ${pulse ? "text-destructive" : "text-[var(--color-neon)]"}`}>
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function FixtureGrid({ matches, tone, now }: { matches: Match[]; tone: "live" | "upcoming" | "closed"; now: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {matches.map((m) => (
        <FixtureCard key={m.id} match={m} tone={tone} now={now} />
      ))}
    </div>
  );
}

function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map: Record<typeof pos, string> = {
    tl: "top-0 left-0 border-t border-l",
    tr: "top-0 right-0 border-t border-r",
    bl: "bottom-0 left-0 border-b border-l",
    br: "bottom-0 right-0 border-b border-r",
  };
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-[var(--color-neon)] ${map[pos]}`}
    />
  );
}

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <span className="grid h-10 w-16 place-items-center bg-[var(--color-surface-border)]/40 text-[10px] font-bold uppercase text-[var(--color-ink-muted)]">
        {name.slice(0, 3)}
      </span>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-16 object-cover"
      loading="lazy"
    />
  );
}

function FixtureCard({ match, tone, now }: { match: Match; tone: "live" | "upcoming" | "closed"; now: number }) {
  const live = tone === "live";
  const finished = tone === "closed";
  const diff = new Date(match.kickoff_at).getTime() - now;
  const ko = live
    ? "LIVE"
    : finished
      ? "Full time"
      : formatCountdown(diff);

  const home = match.reference_odds?.home ?? null;
  const draw = match.reference_odds?.draw ?? null;
  const away = match.reference_odds?.away ?? null;
  const showScore = live || finished;
  const hScore = match.home_score;
  const aScore = match.away_score;

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      aria-label={`Open market for ${match.home_team} vs ${match.away_team}`}
      className="group relative block overflow-hidden border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] transition-colors hover:border-[var(--color-neon)]/60"
    >
      <Corner pos="tl" /><Corner pos="tr" />
      <Corner pos="bl" /><Corner pos="br" />

      {/* Stencil header band */}
      <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-4 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          {match.stage || "Round of 32"}
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${live ? "text-destructive" : "text-[var(--color-ink-muted)]"}`}>
          {live && (
            <span className="mr-1.5 inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-destructive align-middle" />
          )}
          {finished ? "Full time" : formatKickoffDate(match.kickoff_at)}
        </span>
      </div>

      <div className="space-y-4 px-4 py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          <div className="flex flex-col items-center gap-2">
            <TeamFlag name={match.home_team} />
            <span className="max-w-[110px] truncate text-center text-xs font-bold uppercase tracking-wide">
              {match.home_team}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            {showScore ? (
              <span className="font-display text-2xl font-bold leading-none tabular-nums text-[var(--color-ink)]">
                {hScore ?? 0}<span className="mx-1 text-[var(--color-ink-muted)]">–</span>{aScore ?? 0}
              </span>
            ) : (
              <span className="font-display text-lg font-bold leading-none text-[var(--color-ink-muted)]">vs</span>
            )}
            <span className="h-6 w-px bg-[var(--color-neon)]/40" />
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.2em] ${live ? "text-destructive" : "text-[var(--color-neon)]"}`}>
              <Clock className="h-2.5 w-2.5" /> {ko}
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <TeamFlag name={match.away_team} />
            <span className="max-w-[110px] truncate text-center text-xs font-bold uppercase tracking-wide">
              {match.away_team}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { label: match.home_team, price: home },
            { label: "Draw", price: draw },
            { label: match.away_team, price: away },
          ].map((o, i) => (
            <div
              key={i}
              className="relative flex flex-col items-center gap-1 border border-[var(--color-surface-border)] bg-[#070D0A] px-2 py-2.5 transition-colors group-hover:border-[var(--color-neon)]/60"
            >
              <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                {o.label}
              </span>
              <span className="font-display text-lg font-bold tabular-nums text-[var(--color-ink)]">
                {o.price != null ? Number(o.price).toFixed(2) : "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-3 text-[10px] font-bold uppercase tracking-[0.28em]">
          <span className="text-[var(--color-ink-muted)]">
            {finished ? "Result" : "Open Market"}
          </span>
          <span className="inline-flex items-center gap-1 text-[var(--color-neon)] transition-transform group-hover:translate-x-0.5">
            View →
          </span>
        </div>
      </div>
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="relative overflow-hidden border border-dashed border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/40 px-6 py-16 text-center">
      <Corner pos="tl" /><Corner pos="tr" />
      <Corner pos="bl" /><Corner pos="br" />
      <p className="text-[11px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
        No fixtures on the slate
      </p>
      <p className="mt-2 text-[13px] text-[var(--color-ink-muted)]">
        Check back closer to kickoff.
      </p>
    </div>
  );
}
