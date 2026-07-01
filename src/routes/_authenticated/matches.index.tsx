import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitPrediction } from "@/lib/predictions.functions";
import { listMatchesForUsers } from "@/lib/matches.functions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2, Radio, Zap, ArrowUpRight } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MarketTabs } from "@/components/matches/MarketTabs";
import { useAuth } from "@/hooks/use-auth";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";

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

function humanize(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").trim();
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatKickoffDate(iso: string): string {
  const d = new Date(iso);
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = months[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${month} ${day} ${hours}:${minutes}${ampm}`;
}

/* corner tick marks, mirrored from dashboard */
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
      } else {
        if (kickoff >= now - threeHours && kickoff <= now + oneDay) {
          s.push(m);
        }
      }
    }
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { scheduled: s, completed: c };
  }, [data]);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Scoreboard grain background */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />

      <div
        className="relative mx-auto flex max-w-md flex-col gap-5 px-3 py-5 md:max-w-2xl md:px-4 md:py-8"
        style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom))" }}
      >

        {/* Header */}
        <header className="flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <CsseLogo size={22} />
          </Link>
        </header>

        {/* Editorial intro */}
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.32em] text-[var(--color-neon)]">
            <Radio className="h-3 w-3" />
            FIFA World Cup · 2026
          </div>
        </section>

        {isLoading ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data?.length ? (
          <article className="relative overflow-hidden border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-5 py-10 text-center">
            <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
            <h2 className="font-display text-lg font-bold uppercase tracking-tight">No matches yet</h2>
            <p className="mt-1 text-sm text-[var(--color-ink-muted)]">An admin needs to sync or add fixtures.</p>
          </article>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] pb-2">
                <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                  <Zap className="h-3 w-3" /> Round of 32
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                  {scheduled.length} on the slate
                </span>
              </div>
              {scheduled.length === 0 ? (
                <article className="relative overflow-hidden border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] p-5 text-center text-sm text-[var(--color-ink-muted)]">
                  <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
                  No upcoming matches.
                </article>
              ) : (
                scheduled.map((m) => <MatchCard key={m.id} match={m} />)
              )}
            </section>

            {completed.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-[var(--color-surface-border)] bg-[#070D0A] px-4 py-3 text-xs font-bold uppercase tracking-[0.22em] transition-colors hover:border-[var(--color-neon)] hover:text-[var(--color-neon)]"
                  >
                    <span>Completed matches ({completed.length})</span>
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3 space-y-3">
                  {completed.map((m) => <MatchCard key={m.id} match={m} />)}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const submit = useServerFn(submitPrediction);
  const qc = useQueryClient();
  const { user } = useAuth();
  const [stake, setStake] = useState("10");
  const [pick, setPick] = useState<"HOME" | "DRAW" | "AWAY" | null>(null);

  const oddsTrusted = !match.odds_status || match.odds_status === "trusted" || match.manual_override === true;
  const suspendedMarkets = match.suspended_markets ?? [];
  const resultSuspended = suspendedMarkets.includes("result") || suspendedMarkets.includes("ALL");
  const locked = new Date(match.kickoff_at).getTime() <= Date.now() || match.status !== "scheduled";
  const bettingBlocked = !oddsTrusted || resultSuspended;
  const odds = match.reference_odds ?? { home: 2.0, draw: 3.2, away: 3.5 };

  const myResultBets = useQuery({
    queryKey: ["my-match-result-bets", match.id, user?.id],
    enabled: !!user && !locked,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("outcome")
        .eq("match_id", match.id)
        .eq("user_id", user!.id)
        .eq("market", "result")
        .eq("status", "pending");
      if (error) throw error;
      return data ?? [];
    },
  });
  const placedResults = useMemo(() => {
    const s = new Set<string>();
    for (const b of (myResultBets.data ?? []) as Array<{ outcome: string }>) s.add(b.outcome);
    return s;
  }, [myResultBets.data]);


  const slipClientRequestId = useMemo(() => crypto.randomUUID(), [match.id, pick, stake]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!pick) throw new Error("Pick an outcome");
      const ref = pick === "HOME" ? odds.home : pick === "DRAW" ? odds.draw : odds.away;
      return submit({
        data: {
          matchId: match.id, market: "result", outcome: pick,
          referenceOdds: Number(ref), virtualStake: Number(stake),
          clientRequestId: slipClientRequestId,
        },
      });
    },
    onSuccess: () => {
      toast.success("Prediction submitted");
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["my-match-result-bets", match.id, user?.id] });
      setPick(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stageLabel = useMemo(() => "Round of 32", []);

  const stakeNum = Number(stake);
  const stakeValid = stakeNum >= 10 && stakeNum <= 50000;

  return (
    <article className="relative overflow-hidden border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />

      {/* Stencil header band */}
      <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          {stageLabel}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          {formatKickoffDate(match.kickoff_at)}
        </span>
      </div>

      <div className="space-y-4 px-3 py-4 sm:px-5 sm:py-5">
        <Link
          to="/matches/$matchId"
          params={{ matchId: match.id }}
          className="block w-full text-left transition-opacity hover:opacity-90"
          aria-label="Open match analytics"
        >
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col items-center gap-2">
              <TeamFlag name={match.home_team} />
              <span className="max-w-[110px] truncate text-center text-xs font-bold uppercase tracking-wide">
                {match.home_team}
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="font-display text-lg font-bold leading-none text-[var(--color-ink-muted)]">
                {match.status === "finished" ? `${match.home_score} – ${match.away_score}` : "vs"}
              </span>
              <span className="h-6 w-px bg-[var(--color-neon)]/40" />
              <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--color-neon)]">View analytics →</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <TeamFlag name={match.away_team} />
              <span className="max-w-[110px] truncate text-center text-xs font-bold uppercase tracking-wide">
                {match.away_team}
              </span>
            </div>
          </div>
        </Link>

        {bettingBlocked && !locked && (
          <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-destructive">
            Market temporarily suspended while odds are being verified.
          </div>
        )}

        {!locked && match.reference_odds && (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {(["HOME", "DRAW", "AWAY"] as const).map((p) => {
                const label = p === "HOME" ? match.home_team : p === "AWAY" ? match.away_team : "Draw";
                const price = p === "HOME" ? odds.home : p === "DRAW" ? odds.draw : odds.away;
                const alreadyPlaced = placedResults.has(p);
                const disabled = alreadyPlaced || bettingBlocked;
                const selected = pick === p;
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={disabled}
                    title={
                      bettingBlocked ? "Market suspended" :
                      alreadyPlaced ? "You already placed a bet on this selection" : undefined
                    }
                    onClick={() => setPick(p)}
                    className={`relative flex flex-col items-center gap-1 border px-2 py-2.5 transition-colors disabled:opacity-50 ${
                      selected
                        ? "border-[var(--color-neon)] bg-[var(--color-neon)]/10 text-[var(--color-neon)] shadow-[0_0_18px_var(--color-neon-glow)]"
                        : "border-[var(--color-surface-border)] bg-[#070D0A] hover:border-[var(--color-neon)]/60"
                    }`}
                  >
                    <span className="max-w-full truncate text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                      {label}
                    </span>
                    <span className="font-display text-lg font-bold tabular-nums">{price}</span>
                    {alreadyPlaced && (
                      <span className="absolute right-1 top-1 text-[9px] font-bold text-[var(--color-neon)]">✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2">
              <input
                type="number"
                min={10}
                max={50000}
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                placeholder="Stake (10-50,000)"
                disabled={bettingBlocked}
                className="flex-1 border border-[var(--color-surface-border)] bg-[#070D0A] px-3 py-2.5 font-display text-sm font-bold tabular-nums text-[var(--color-ink)] outline-none transition-colors focus:border-[var(--color-neon)] disabled:opacity-50"
              />
              <button
                type="button"
                disabled={bettingBlocked || !pick || mut.isPending || !stakeValid}
                onClick={() => mut.mutate()}
                className="flex items-center justify-center gap-2 rounded-full bg-[var(--color-neon)] px-5 py-2.5 text-xs font-bold uppercase tracking-[0.22em] text-black shadow-[0_0_24px_var(--color-neon-glow)] transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Bet</span><ArrowUpRight className="h-4 w-4" /></>}
              </button>
            </div>

            <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              {match.odds_source === "the-odds-api"
                ? <>updated by <BrandText /> {timeAgo(match.odds_updated_at)}</>
                : "Reference odds (awaiting live market sync)"}
            </div>
          </div>
        )}

        {!locked && <MarketTabs matchId={match.id} locked={locked} bettingBlocked={bettingBlocked} suspendedMarkets={suspendedMarkets} />}

        {locked && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
            {match.status === "finished" ? "Match finished." : "Betting closed — kickoff passed."}
          </div>
        )}

      </div>
    </article>
  );
}

function TeamFlag({ name }: { name: string }) {
  const url = teamFlagUrl(name, 160);
  if (!url) {
    return (
      <div className="grid h-10 w-16 place-items-center border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-ink)] shadow-sm">
        {name.slice(0, 3)}
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={`${name} flag`}
      className="h-10 w-16 shrink-0 border border-border/40 object-cover shadow-sm"
      loading="lazy"
    />
  );
}
