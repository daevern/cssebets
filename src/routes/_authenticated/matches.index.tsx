import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { submitPrediction } from "@/lib/predictions.functions";
import { listMatchesForUsers } from "@/lib/matches.functions";
import { getMyWallet } from "@/lib/wallet.functions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, Loader2, ArrowUpRight } from "lucide-react";
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

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function formatKickoff(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

function MatchesPage() {
  const qc = useQueryClient();
  const listMatches = useServerFn(listMatchesForUsers);

  const { data, isLoading } = useQuery({
    queryKey: ["matches"],
    queryFn: async () => (await listMatches()) as Match[],
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
      if (m.status === "finished") c.push(m);
      else if (kickoff >= now - threeHours && kickoff <= now + oneDay) s.push(m);
    }
    c.sort((a, b) => new Date(b.kickoff_at).getTime() - new Date(a.kickoff_at).getTime());
    return { scheduled: s, completed: c };
  }, [data]);

  return (
    <div className="relative min-h-screen text-[var(--ink)]">
      <div
        className="relative mx-auto flex max-w-2xl flex-col gap-16 px-5 pt-10 md:px-8 md:pt-16"
        style={{ paddingBottom: "calc(220px + env(safe-area-inset-bottom))" }}
      >
        {/* Editorial masthead — one line, quiet, confident */}
        <header className="flex items-baseline justify-between">
          <Link to="/dashboard" className="flex items-center gap-2.5">
            <CsseLogo size={20} />
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-[0.28em] text-[var(--ink-faint)]">
            FIFA World Cup · 2026
          </span>
        </header>

        {/* Section title — typography as the design element */}
        <section className="space-y-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--ink-faint)]">
            Round of 32
          </p>
          <h1 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-[var(--ink)] md:text-5xl">
            The slate<span className="text-[var(--ink-faint)]">.</span>
          </h1>
          <p className="max-w-md text-[14px] leading-relaxed text-[var(--ink-2)]">
            {scheduled.length} live and upcoming fixture{scheduled.length === 1 ? "" : "s"}. Settled on official
            result. Priced against real bookmaker markets.
          </p>
        </section>

        {isLoading ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--neon)]" />
          </div>
        ) : !data?.length ? (
          <div className="py-16 text-center">
            <h2 className="font-display text-2xl font-medium tracking-tight">No matches yet</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">An admin needs to sync or add fixtures.</p>
          </div>
        ) : (
          <>
            <section className="divide-y divide-[var(--surface-hairline)]">
              {scheduled.length === 0 ? (
                <p className="py-10 text-center text-sm text-[var(--ink-muted)]">
                  No upcoming matches on the slate right now.
                </p>
              ) : (
                scheduled.map((m) => <MatchRow key={m.id} match={m} />)
              )}
            </section>

            {completed.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="mx-auto flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    <span>Completed · {completed.length}</span>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-8 divide-y divide-[var(--surface-hairline)]">
                  {completed.map((m) => <MatchRow key={m.id} match={m} />)}
                </CollapsibleContent>
              </Collapsible>
            )}
          </>
        )}

        <footer className="mt-10 border-t border-[var(--surface-hairline)] pt-6 text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          © {new Date().getFullYear()} <BrandText />
        </footer>
      </div>
    </div>
  );
}

/* Editorial fixture row — no card, no border, no glow.
 * Typography and space carry the hierarchy. */
function MatchRow({ match }: { match: Match }) {
  const submit = useServerFn(submitPrediction);
  const walletFn = useServerFn(getMyWallet);
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
  const kickoff = formatKickoff(match.kickoff_at);

  const wallet = useQuery({
    queryKey: ["my-wallet", user?.id],
    queryFn: () => walletFn({}),
    enabled: !!user?.id && !locked,
    staleTime: 15000,
  });
  const balance = Number(wallet.data?.balance ?? 0);

  const myResultBets = useQuery({
    queryKey: ["my-match-result-bets", match.id, user?.id],
    enabled: !!user && !locked,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("predictions")
        .select("outcome")
        .eq("match_id", match.id).eq("user_id", user!.id)
        .eq("market", "result").eq("status", "pending");
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
      toast.success("Prediction locked");
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
      qc.invalidateQueries({ queryKey: ["my-wallet"] });
      qc.invalidateQueries({ queryKey: ["my-match-result-bets", match.id, user?.id] });
      setPick(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stakeNum = Number(stake);
  const stakeValid = stakeNum >= 10 && stakeNum <= 50000;
  const noBalance = balance <= 0;
  const overBalance = stakeNum > balance;
  const canBet = !!pick && stakeValid && !noBalance && !overBalance && !bettingBlocked && !mut.isPending;
  const potentialReturn = stakeValid && pick ? stakeNum * (pick === "HOME" ? odds.home : pick === "DRAW" ? odds.draw : odds.away) : 0;
  const potentialGain = potentialReturn - (stakeValid ? stakeNum : 0);
  const buttonLabel = noBalance ? "Add points to lock" : overBalance ? "Exceeds balance" : "Lock prediction";

  return (
    <article className="group py-10 first:pt-0">
      {/* Metadata line — small, quiet, information-dense */}
      <div className="mb-6 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        <span>{kickoff.date} · {kickoff.time}</span>
        <Link
          to="/matches/$matchId"
          params={{ matchId: match.id }}
          className="inline-flex items-center gap-1 text-[var(--ink-muted)] transition-colors hover:text-[var(--neon)]"
        >
          Analytics <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Fixture — editorial, typography-led */}
      <Link
        to="/matches/$matchId"
        params={{ matchId: match.id }}
        className="block"
      >
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-8">
          <TeamBlock name={match.home_team} align="right" />
          <div className="flex min-w-0 flex-col items-center gap-1">
            {match.status === "finished" ? (
              <div className="flex items-baseline gap-2 font-display text-4xl font-medium tabular-nums tracking-tight md:text-5xl">
                <span>{match.home_score ?? 0}</span>
                <span className="text-[var(--ink-faint)]">–</span>
                <span>{match.away_score ?? 0}</span>
              </div>
            ) : (
              <span className="font-display text-2xl font-light italic tracking-tight text-[var(--ink-faint)] md:text-3xl">
                v
              </span>
            )}
          </div>
          <TeamBlock name={match.away_team} align="left" />
        </div>
      </Link>

      {bettingBlocked && !locked && (
        <p className="mt-6 text-center text-[12px] text-[var(--ink-muted)]">
          Market temporarily paused while odds are being verified.
        </p>
      )}

      {/* Match Result — conversational, no framing */}
      {!locked && match.reference_odds && (
        <div className="mt-8 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-[17px] font-medium leading-snug text-[var(--ink)]">
              Who wins?
            </h3>
            <span className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--ink-faint)]">
              Multiplier · Chance
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {(["HOME", "DRAW", "AWAY"] as const).map((p) => {
              const label = p === "HOME" ? match.home_team : p === "AWAY" ? match.away_team : "Draw";
              const price = p === "HOME" ? odds.home : p === "DRAW" ? odds.draw : odds.away;
              const alreadyPlaced = placedResults.has(p);
              const disabled = alreadyPlaced || bettingBlocked;
              const selected = pick === p;
              const prob = price > 0 ? Math.round((1 / Number(price)) * 100) : 0;
              return (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  title={
                    bettingBlocked ? "Market paused" :
                    alreadyPlaced ? "You already locked this prediction" : undefined
                  }
                  onClick={() => setPick(p)}
                  aria-pressed={selected}
                  className={`group/tile relative flex flex-col items-start gap-1.5 rounded-sm px-4 py-4 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    selected
                      ? "bg-[var(--neon)]/10 ring-1 ring-inset ring-[var(--neon)]/60"
                      : "bg-[var(--surface-2)]/60 hover:bg-[var(--surface-3)]/60"
                  }`}
                >
                  <span className={`truncate text-[11px] font-medium uppercase tracking-[0.14em] ${selected ? "text-[var(--neon)]" : "text-[var(--ink-muted)]"}`}>
                    {label}
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`font-display text-2xl font-medium tabular-nums tracking-tight ${selected ? "text-[var(--neon)]" : "text-[var(--ink)]"}`}>
                      {Number(price).toFixed(2)}
                    </span>
                    <span className="text-[10px] font-medium tabular-nums text-[var(--ink-faint)]">
                      {prob}%
                    </span>
                  </div>
                  {alreadyPlaced && (
                    <span className="absolute right-2 top-2 text-[10px] font-medium text-[var(--neon)]">Locked</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Trade ticket — spacious, minimal, primary action dominates */}
          {pick && (
            <div className="mt-6 space-y-4 rounded-sm bg-[var(--surface-2)]/60 p-5">
              <div className="flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                <span>Your prediction</span>
                <button
                  type="button"
                  onClick={() => setPick(null)}
                  className="text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
                >
                  Clear
                </button>
              </div>
              <p className="text-[15px] leading-snug text-[var(--ink)]">
                <span className="font-medium">
                  {pick === "HOME" ? match.home_team : pick === "AWAY" ? match.away_team : "Draw"}
                </span>{" "}
                <span className="text-[var(--ink-muted)]">at</span>{" "}
                <span className="font-display font-medium tabular-nums text-[var(--neon)]">
                  {(pick === "HOME" ? odds.home : pick === "DRAW" ? odds.draw : odds.away).toFixed(2)}x
                </span>
              </p>

              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-medium uppercase tracking-[0.2em] text-[var(--ink-faint)]">
                    Points
                  </span>
                  <input
                    type="number"
                    min={10}
                    max={50000}
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                    disabled={bettingBlocked || noBalance}
                    className="w-full border-0 border-b border-[var(--surface-border)] bg-transparent px-0 pb-2 font-display text-2xl font-medium tabular-nums text-[var(--ink)] outline-none transition-colors focus:border-[var(--neon)] disabled:opacity-40"
                  />
                </label>
                <div className="self-end">
                  <button
                    type="button"
                    disabled={!canBet}
                    onClick={() => mut.mutate()}
                    className="inline-flex h-11 items-center gap-2 rounded-sm bg-[var(--neon)] px-5 text-[13px] font-medium text-black transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[var(--surface-border)] disabled:text-[var(--ink-muted)]"
                  >
                    {mut.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>{buttonLabel}{canBet && <ArrowUpRight className="h-3.5 w-3.5" />}</>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-baseline justify-between text-[12px]">
                <div className="flex items-baseline gap-6 text-[var(--ink-2)]">
                  <span>Return <span className="ml-1 font-display font-medium tabular-nums text-[var(--ink)]">{potentialReturn.toFixed(2)}</span></span>
                  <span>Gain <span className="ml-1 font-display font-medium tabular-nums text-[var(--neon)]">+{potentialGain.toFixed(2)}</span></span>
                </div>
                <span className="text-[var(--ink-faint)]">Bal {balance.toFixed(0)}</span>
              </div>
              {noBalance && (
                <p className="text-[11px] text-[var(--ink-muted)]">
                  You need points to lock this prediction.
                </p>
              )}
            </div>
          )}

          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--ink-faint)]">
            {match.odds_source === "the-odds-api"
              ? <>Bookmaker priced · updated {timeAgo(match.odds_updated_at)}</>
              : <>Reference multipliers</>}
            <span className="mx-2 text-[var(--ink-faint)]">·</span>
            Virtual points · Audit logged
          </p>
        </div>
      )}

      {!locked && (
        <div className="mt-8">
          <MarketTabs
            matchId={match.id}
            locked={locked}
            bettingBlocked={bettingBlocked}
            suspendedMarkets={suspendedMarkets}
            homeTeam={match.home_team}
            awayTeam={match.away_team}
          />
        </div>
      )}

      {locked && (
        <p className="mt-6 text-[12px] text-[var(--ink-muted)]">
          {match.status === "finished" ? "Match finished." : "Predictions closed — kickoff passed."}
        </p>
      )}
    </article>
  );
}

function TeamBlock({ name, align }: { name: string; align: "left" | "right" }) {
  const url = teamFlagUrl(name, 160);
  const isRight = align === "right";
  return (
    <div className={`flex min-w-0 items-center gap-3 md:gap-4 ${isRight ? "justify-end text-right" : "justify-start text-left"}`}>
      {isRight && (
        <span
          className="font-display truncate text-[15px] font-medium leading-tight tracking-tight text-[var(--ink)] md:text-lg"
          title={name}
        >
          {name}
        </span>
      )}
      <div className="h-8 w-11 shrink-0 overflow-hidden md:h-9 md:w-12">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--surface-3)] text-[9px] font-medium tracking-wider text-[var(--ink-muted)]">
            {name.slice(0, 3).toUpperCase()}
          </div>
        )}
      </div>
      {!isRight && (
        <span
          className="font-display truncate text-[15px] font-medium leading-tight tracking-tight text-[var(--ink)] md:text-lg"
          title={name}
        >
          {name}
        </span>
      )}
    </div>
  );
}
