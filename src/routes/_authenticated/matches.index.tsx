import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listMatchesForUsers } from "@/lib/matches.functions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2, Radio, ArrowUpRight } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { useEffect, useMemo, useState } from "react";
import { CsseLogo } from "@/components/brand/CsseMark";

export const Route = createFileRoute("/_authenticated/matches/")({
  head: () => ({ meta: [{ title: "Markets — cssebets" }] }),
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

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function useCountdown(iso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "Live / kickoff";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `Kicks off in ${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `Kicks off in ${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `Kicks off in ${d}d ${h % 24}h`;
}

function MatchesPage() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesForUsers);

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

  const { scheduled, completed } = useMemo(() => {
    const s: Match[] = [];
    const c: Match[] = [];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const threeHours = 3 * 60 * 60 * 1000;

    for (const m of data ?? []) {
      const kickoff = new Date(m.kickoff_at).getTime();
      if (m.status === "finished") {
        c.push(m);
      } else if (kickoff >= now - threeHours && kickoff <= now + oneDay) {
        s.push(m);
      }
    }
    s.sort((a, b) => new Date(a.kickoff_at).getTime() - new Date(b.kickoff_at).getTime());
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { scheduled: s, completed: c };
  }, [data]);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, var(--color-neon) 5%, transparent), transparent 60%)",
        }}
      />

      <div
        className="relative mx-auto flex max-w-md flex-col gap-6 px-4 pt-5 md:max-w-3xl md:gap-8 md:py-10"
        style={{ paddingBottom: "calc(140px + env(safe-area-inset-bottom))" }}
      >
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CsseLogo size={22} />
          </Link>
          <span className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
            <Radio className="h-3 w-3" /> FIFA World Cup · 2026
          </span>
        </header>

        <section className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)] md:text-3xl">
            Today's prediction markets
          </h1>
          <p className="text-[12px] leading-snug text-[var(--color-ink-muted)]">
            Browse fixtures and open a market to see analytics and lock your prediction.
          </p>
        </section>

        {isLoading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data?.length ? (
          <div className="border-t border-[var(--color-surface-border)]/50 py-10 text-center">
            <p className="font-display text-base font-semibold tracking-tight">No markets yet</p>
            <p className="mt-1 text-[12px] text-[var(--color-ink-muted)]">Fixtures will appear as they're synced.</p>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-baseline justify-between border-b border-[var(--color-surface-border)]/40 pb-2">
                <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
                  Round of 32
                </span>
                <span className="text-[10px] font-medium tracking-tight text-[var(--color-ink-muted)]">
                  {scheduled.length} on the slate
                </span>
              </div>
              {scheduled.length === 0 ? (
                <p className="py-6 text-center text-[12px] text-[var(--color-ink-muted)]">
                  No upcoming markets in the next 24h.
                </p>
              ) : (
                <ul className="divide-y divide-[var(--color-surface-border)]/40">
                  {scheduled.map((m) => (
                    <li key={m.id}>
                      <FixtureRow match={m} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {completed.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between border-t border-[var(--color-surface-border)]/40 pt-4 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    <span>Completed matches ({completed.length})</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <ul className="divide-y divide-[var(--color-surface-border)]/40">
                    {completed.map((m) => (
                      <li key={m.id}>
                        <FixtureRow match={m} />
                      </li>
                    ))}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FixtureRow({ match }: { match: Match }) {
  const finished = match.status === "finished";
  const kickoff = new Date(match.kickoff_at).getTime();
  const live = !finished && kickoff <= Date.now();
  const countdown = useCountdown(match.kickoff_at);

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
      className="group block py-4 transition-colors"
    >
      {/* Header: competition / status */}
      <div className="mb-3 flex items-center justify-between text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
        <span className="uppercase tracking-[0.18em]">
          FIFA World Cup · Round of 32
        </span>
        <span className="flex items-center gap-1.5">
          {finished ? (
            <span className="tracking-tight">Full time</span>
          ) : live ? (
            <span className="flex items-center gap-1 font-semibold text-[var(--color-neon)]">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
              Live
            </span>
          ) : (
            <span className="tracking-tight">{countdown}</span>
          )}
        </span>
      </div>

      {/* Teams row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TeamLine name={match.home_team} score={finished ? match.home_score : null} />
          <TeamLine name={match.away_team} score={finished ? match.away_score : null} />
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[11px] font-medium tracking-tight text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-neon)]">
          View Market
          <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
      </div>

      {/* Market estimate + updated */}
      {!finished && probs && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-[var(--color-ink-muted)]">
          <span>
            <span className="text-[var(--color-ink)]">{match.home_team}</span>{" "}
            <span className="font-semibold text-[var(--color-neon)]">{probs.home}%</span>
          </span>
          <span className="opacity-40">·</span>
          <span>
            Draw <span className="font-semibold text-[var(--color-neon)]">{probs.draw}%</span>
          </span>
          <span className="opacity-40">·</span>
          <span>
            <span className="text-[var(--color-ink)]">{match.away_team}</span>{" "}
            <span className="font-semibold text-[var(--color-neon)]">{probs.away}%</span>
          </span>
          {match.odds_updated_at && (
            <span className="ml-auto text-[10px] opacity-70">
              Updated {timeAgo(match.odds_updated_at)}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}

function TeamLine({ name, score }: { name: string; score: number | null }) {
  const url = teamFlagUrl(name, 80);
  return (
    <div className="flex items-center gap-2.5">
      {url ? (
        <img
          src={url}
          alt=""
          className="h-5 w-8 shrink-0 border border-[var(--color-surface-border)]/50 object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-5 w-8 shrink-0 border border-[var(--color-surface-border)]/50 bg-[var(--color-surface-2)]" />
      )}
      <span className="min-w-0 flex-1 truncate text-[14px] font-medium tracking-tight text-[var(--color-ink)]">
        {name}
      </span>
      {score != null && (
        <span className="font-display text-base font-semibold tabular-nums text-[var(--color-ink)]">
          {score}
        </span>
      )}
    </div>
  );
}
