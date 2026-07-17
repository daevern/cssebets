import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFootballMatches } from "../football.functions";
import { FootballMatchCard } from "../components/FootballMatchCard";
import { FOOTBALL_COMPETITIONS, type FootballCompetitionCode } from "../config/footballCompetitions";
import type { FootballMatch } from "../types/football";

export function FootballCompetitionPage({ code }: { code: FootballCompetitionCode }) {
  const cfg = FOOTBALL_COMPETITIONS[code];
  const fetcher = useServerFn(listFootballMatches);
  const { data, isLoading, error } = useQuery({
    queryKey: ["football-matches", code],
    queryFn: () => fetcher({ data: { competition: code, limit: 50 } }),
    refetchInterval: 60_000,
  });

  const matches = data?.matches ?? [];
  const now = Date.now();
  const live = matches.filter((m) => m.status === "live" || m.status === "halftime");
  const upcoming = matches.filter((m) => m.status === "scheduled" && new Date(m.kickoffAt).getTime() > now);
  const finished = matches.filter((m) => m.status === "finished");

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ink)]">{cfg.displayName}</h1>
        <p className="text-sm text-[var(--ink-muted)]">{cfg.country} · Season {cfg.currentSeason}</p>
      </header>

      {isLoading ? (
        <Skeletons />
      ) : error ? (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          Could not load matches. Please try again.
        </div>
      ) : matches.length === 0 ? (
        <EmptyState code={code} />
      ) : (
        <div className="space-y-6">
          {live.length > 0 && <Section title="Live" matches={live} />}
          {upcoming.length > 0 && <Section title="Upcoming" matches={upcoming} />}
          {finished.length > 0 && <Section title="Recently finished" matches={finished.slice(0, 10)} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, matches }: { title: string; matches: FootballMatch[] }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-[var(--ink-muted)] font-semibold mb-2">{title}</h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <FootballMatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-24 rounded-2xl bg-[var(--surface)]/60 animate-pulse" />
      ))}
    </div>
  );
}

function EmptyState({ code }: { code: FootballCompetitionCode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/40 p-6 text-center">
      <div className="text-lg font-semibold text-[var(--ink)] mb-1">No fixtures yet</div>
      <p className="text-sm text-[var(--ink-muted)]">
        {FOOTBALL_COMPETITIONS[code].displayName} fixtures will appear here once the next matchday is synced.
      </p>
    </div>
  );
}
