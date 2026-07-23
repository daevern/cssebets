import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listFootballMatches } from "@/features/football/football.functions";
import { BONUS_COMPETITIONS } from "@/features/football/config/footballCompetitions";
import type { FootballCompetitionCode } from "@/features/football/config/footballCompetitions";
import type { FootballMatch } from "@/features/football/types/football";

export const Route = createFileRoute("/_authenticated/bonus/")({
  head: () => ({
    meta: [
      { title: "Bonus Leagues — MLS & Brasileirão | CSSEBets" },
      {
        name: "description",
        content: "Live and upcoming MLS and Brasileirão Série A fixtures with real bookmaker odds.",
      },
      { property: "og:title", content: "Bonus Leagues — CSSEBets" },
      {
        property: "og:description",
        content: "MLS and Brasileirão markets updated in real time.",
      },
    ],
  }),
  component: BonusIndex,
});

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  live: { label: "LIVE", cls: "bg-[var(--neon)]/20 text-[var(--neon)] animate-pulse" },
  halftime: { label: "HT", cls: "bg-orange-500/20 text-orange-400" },
  finished: { label: "FT", cls: "bg-white/10 text-[var(--ink-muted)]" },
  postponed: { label: "PPD", cls: "bg-yellow-500/20 text-yellow-300" },
  cancelled: { label: "CANC", cls: "bg-red-500/20 text-red-400" },
};

function BonusIndex() {
  const [active, setActive] = useState<FootballCompetitionCode>(BONUS_COMPETITIONS[0].code);
  const cfg = BONUS_COMPETITIONS.find((c) => c.code === active)!;

  const fetcher = useServerFn(listFootballMatches);
  const { data, isLoading } = useQuery({
    queryKey: ["bonus-matches", active],
    queryFn: () => fetcher({ data: { competition: active, limit: 60 } }),
    refetchInterval: 60_000,
  });

  const now = Date.now();
  const matches = data?.matches ?? [];
  const live = matches.filter((m) => m.status === "live" || m.status === "halftime");
  const upcoming = matches
    .filter((m) => m.status === "scheduled" && new Date(m.kickoffAt).getTime() > now)
    .sort((a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime());
  const finished = matches.filter((m) => m.status === "finished").slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 pb-24">
      <div className="mb-3 text-xs uppercase tracking-wider text-[var(--ink-muted)]">
        Sports › <span className="text-[var(--ink)]">Bonus</span>
      </div>

      <header className="mb-5 space-y-2">
        <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight text-[var(--ink)] md:text-4xl">
          <span className="text-[var(--neon)]">Bonus</span> leagues
        </h1>
        <p className="text-[13px] text-[var(--ink-muted)]">
          Fresh markets for domestic leagues outside the World Cup rotation.
        </p>
      </header>

      {/* League switcher — segmented bar */}
      <div className="mb-6 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/50 p-1">
        {BONUS_COMPETITIONS.map((c) => {
          const isActive = c.code === active;
          return (
            <button
              key={c.code}
              type="button"
              onClick={() => setActive(c.code)}
              className={`rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors ${
                isActive
                  ? "bg-[var(--neon)]/15 text-[var(--neon)] shadow-[0_0_0_1px_var(--neon)]"
                  : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
              }`}
            >
              {c.shortName}
              <span className="ml-1 text-[10px] font-medium uppercase tracking-wider opacity-60">
                {c.country}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mb-5 rounded-xl border border-[var(--color-surface-border)]/50 bg-[var(--surface)]/40 px-4 py-3">
        <div className="text-[11px] uppercase tracking-wider text-[var(--ink-muted)]">Season</div>
        <div className="text-sm font-semibold text-[var(--ink)]">
          {cfg.displayName} · {cfg.currentSeason}
        </div>
      </div>

      {isLoading ? (
        <Skeletons />
      ) : matches.length === 0 ? (
        <EmptyState name={cfg.displayName} />
      ) : (
        <div className="space-y-6">
          {live.length > 0 && <Section title="Live" matches={live} />}
          {upcoming.length > 0 && <Section title="Upcoming" matches={upcoming} />}
          {finished.length > 0 && <Section title="Recently finished" matches={finished} />}
        </div>
      )}
    </div>
  );
}

function Section({ title, matches }: { title: string; matches: FootballMatch[] }) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.18em] text-[var(--ink-muted)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--neon)]" />
        {title}
      </h2>
      <div className="space-y-2">
        {matches.map((m) => (
          <BonusMatchCard key={m.id} match={m} />
        ))}
      </div>
    </section>
  );
}

function BonusMatchCard({ match }: { match: FootballMatch }) {
  const kickoff = new Date(match.kickoffAt);
  const badge = STATUS_BADGE[match.status];
  const showScore =
    match.status === "live" || match.status === "halftime" || match.status === "finished";
  const timeLabel = kickoff.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link
      to="/bonus/$matchId"
      params={{ matchId: match.id }}
      className="block rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/60 p-4 transition-colors hover:border-[var(--neon)]/40"
    >
      <div className="mb-3 flex items-center justify-between text-[11px] text-[var(--ink-muted)]">
        <span className="font-semibold uppercase tracking-wider">
          {match.competitionCode}
          {match.round ? ` · ${match.round}` : ""}
        </span>
        <span className="flex items-center gap-2">
          {badge ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
              {badge.label}
              {match.status === "live" && match.liveMinute != null ? ` ${match.liveMinute}'` : ""}
            </span>
          ) : (
            <span>{timeLabel}</span>
          )}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <TeamRow name={match.home.name} logo={match.home.logo} score={showScore ? match.home.score : null} />
        <div className="text-xs text-[var(--ink-muted)]">vs</div>
        <TeamRow
          name={match.away.name}
          logo={match.away.logo}
          score={showScore ? match.away.score : null}
          align="right"
        />
      </div>

      {match.venue ? (
        <div className="mt-3 truncate text-[11px] text-[var(--ink-muted)]">{match.venue}</div>
      ) : null}
    </Link>
  );
}

function TeamRow({
  name,
  logo,
  score,
  align = "left",
}: {
  name: string;
  logo: string | null;
  score: number | null;
  align?: "left" | "right";
}) {
  return (
    <div className={`flex flex-1 items-center gap-2 ${align === "right" ? "justify-end" : ""}`}>
      {align === "left" && logo ? <img src={logo} alt="" className="h-6 w-6 object-contain" /> : null}
      <span className="truncate text-sm font-medium text-[var(--ink)]">{name}</span>
      {score != null ? <span className="text-lg font-bold tabular-nums text-[var(--ink)]">{score}</span> : null}
      {align === "right" && logo ? <img src={logo} alt="" className="h-6 w-6 object-contain" /> : null}
    </div>
  );
}

function Skeletons() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface)]/60" />
      ))}
    </div>
  );
}

function EmptyState({ name }: { name: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-surface-border)]/70 bg-[var(--surface)]/40 p-6 text-center">
      <div className="mb-1 text-lg font-semibold text-[var(--ink)]">No fixtures yet</div>
      <p className="text-sm text-[var(--ink-muted)]">
        {name} fixtures will appear here once the next matchday is synced.
      </p>
    </div>
  );
}
