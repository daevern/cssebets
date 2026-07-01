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
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/matches/")({
  head: () => ({ meta: [{ title: "Matches — cssebets" }] }),
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

function useShortCountdown(iso: string): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return "LIVE";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return `${h}h ${rm}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function abbreviate(name: string): string {
  return name.slice(0, 3).toUpperCase();
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
    <div
      className="relative mx-auto flex max-w-md flex-col gap-5 pt-2 md:max-w-2xl"
      style={{ paddingBottom: "calc(200px + env(safe-area-inset-bottom))" }}
    >
      <h1 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-ink)]">
        Matches
      </h1>

      {isLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
        </div>
      ) : !data?.length ? (
        <div className="py-12 text-center">
          <p className="text-[12px] text-[var(--color-ink-muted)]">No matches scheduled.</p>
        </div>
      ) : (
        <>
          <section className="space-y-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              Round of 32
            </span>
            <ul className="divide-y divide-[var(--color-surface-border)]/40">
              {scheduled.map((m) => (
                <li key={m.id}>
                  <FixtureRow match={m} />
                </li>
              ))}
            </ul>
            {scheduled.length === 0 && (
              <p className="py-6 text-[12px] text-[var(--color-ink-muted)]">
                No upcoming matches in the next 24h.
              </p>
            )}
          </section>

          {completed.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-4 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-ink)]"
                >
                  <span>Finished</span>
                  <ChevronDown className="h-4 w-4" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
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
  );
}

function FixtureRow({ match }: { match: Match }) {
  const finished = match.status === "finished";
  const kickoff = new Date(match.kickoff_at).getTime();
  const live = !finished && kickoff <= Date.now();
  const timeLabel = finished ? "FT" : useShortCountdown(match.kickoff_at);

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

  const estimate = useMemo(() => {
    if (!probs) return null;
    const home = abbreviate(match.home_team);
    const away = abbreviate(match.away_team);
    return `${home} ${probs.home} · DRAW ${probs.draw} · ${away} ${probs.away}`;
  }, [probs, match.home_team, match.away_team]);

  return (
    <Link
      to="/matches/$matchId"
      params={{ matchId: match.id }}
      className="group block"
      aria-label={`Open ${match.home_team} vs ${match.away_team}`}
    >
      <div className="flex flex-col gap-2.5 py-4">
        <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">
          <span className="flex items-center gap-1.5">
            {live && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-neon)]" />
            )}
            {timeLabel}
          </span>
          {finished && match.home_score != null && match.away_score != null && (
            <span className="tabular-nums text-[var(--color-ink)]">
              {match.home_score} - {match.away_score}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-medium leading-tight tracking-tight text-[var(--color-ink)]">
            {match.home_team}
          </span>
          <span className="text-[15px] font-medium leading-tight tracking-tight text-[var(--color-ink)]">
            {match.away_team}
          </span>
        </div>

        <div className="flex items-center justify-between">
          {estimate && (
            <span className="text-[11px] tabular-nums tracking-tight text-[var(--color-ink-muted)]">
              {estimate}
            </span>
          )}
          <ChevronRight className="h-4 w-4 text-[var(--color-ink-muted)] transition-colors group-hover:text-[var(--color-neon)]" />
        </div>
      </div>
    </Link>
  );
}
