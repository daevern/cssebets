import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, Activity, Users, AlertTriangle, History, Star } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { getMatchAnalytics, type AnalyticsBundle, type LineupPlayer } from "@/lib/match-analytics.functions";
import { MarketTabs } from "@/components/matches/MarketTabs";
import { Corner, StencilPanel } from "@/components/ui/page-shell";
import { useAuth } from "@/hooks/use-auth";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { eventMark, WhistleIcon, GoalIcon, YellowCardIcon, RedCardIcon } from "@/components/matches/MatchIcons";
import { MarketAnalyticsCard } from "@/components/matches/MarketAnalyticsCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/matches/$matchId")({
  head: () => ({ meta: [{ title: "Match market — cssebets" }] }),
  component: MatchAnalyticsPage,
});

function MatchAnalyticsPage() {
  const { matchId } = Route.useParams();
  const fn = useServerFn(getMatchAnalytics);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["match-analytics", matchId],
    queryFn: () => fn({ data: { matchId } }) as Promise<AnalyticsBundle>,
    refetchInterval: (q) => {
      const phase = (q.state.data as AnalyticsBundle | undefined)?.phase;
      if (phase === "live") return 30_000;
      if (phase === "lineups") return 5 * 60_000;
      return false;
    },
  });

  // Realtime: refresh on score updates from the matches table
  useEffect(() => {
    const ch = supabase
      .channel(`match-analytics-${matchId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "matches", filter: `id=eq.${matchId}` },
        () => qc.invalidateQueries({ queryKey: ["match-analytics", matchId] }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [matchId, qc]);

  return (
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      {/* Deep atmospheric background — soft radial bloom, no grid */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          background:
            "radial-gradient(1200px 600px at 50% -10%, color-mix(in oklab, var(--color-neon) 6%, transparent), transparent 60%), radial-gradient(900px 500px at 100% 100%, color-mix(in oklab, var(--color-neon) 3%, transparent), transparent 70%)",
        }}
      />
      <div
        className="relative mx-auto flex max-w-md flex-col gap-8 px-4 pt-5 md:max-w-3xl md:gap-10 md:py-10"
        style={{ paddingBottom: "calc(140px + env(safe-area-inset-bottom))" }}
      >
        {/* Back arrow lives in the global TopBar on this route — keep the page focused on the match. */}

        {isLoading || !data ? (
          <div className="grid place-items-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data.match ? (
          <div className="py-16 text-center text-sm text-[var(--color-ink-muted)]">Match not found.</div>
        ) : (
          <Analytics bundle={data} />
        )}

        <footer className="mt-6 flex items-center justify-between border-t border-[var(--color-surface-border)]/40 pt-6 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
          <Link to="/dashboard" className="flex items-center gap-2 hover:text-[var(--color-ink)]"><CsseLogo size={16} /></Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </div>
    </div>
  );
}




function Analytics({ bundle }: { bundle: AnalyticsBundle }) {
  const { match, phase, lineups, events, stats, ratings, h2h, injuries } = bundle;
  if (!match) return null;
  const home = match.home_team;
  const away = match.away_team;
  const hasLineups = !!(lineups.home || lineups.away);
  const hasStats = !!(stats.home || stats.away);
  const hasRatings = ratings.home.length > 0 || ratings.away.length > 0;
  const hasEvents = events.length > 0;
  const hasInjuries = injuries.home.length > 0 || injuries.away.length > 0;
  const hasH2H = h2h.length > 0;

  const locked = phase === "live" || phase === "finished";
  const phaseLabel =
    phase === "finished" ? "Full time" :
    phase === "live" ? "Live" :
    phase === "lineups" ? "Lineups out" : "Pre-match";

  const goals = events.filter((e: any) => String(e.type).toLowerCase() === "goal");
  const homeGoals = goals.filter((e: any) => e.side === "home");
  const awayGoals = goals.filter((e: any) => e.side === "away");

  const lastEvent = events.length ? events[events.length - 1] : null;

  return (
    <>
      <MatchHero
        match={match}
        phaseLabel={phaseLabel}
        phase={phase}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
        lastEvent={lastEvent}
      />

      {/* Market Analytics — historical odds / implied probability */}
      <MarketAnalyticsCard matchId={match.id} />

      {/* Markets — only show pre-kickoff. */}
      {!locked && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] md:text-xl">
              Take a position
            </h2>
            <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
              Markets
            </span>
          </div>
          <MarketTabs matchId={match.id} locked={false} bettingBlocked={false} suspendedMarkets={[]} />
        </section>
      )}
      {locked && <BettingRibbon phase={phase} />}

      {/* ============ Full football analytics report — all sections inline ============ */}

      {phase === "live" && hasStats && (
        <MomentumStrip stats={stats} homeName={home} awayName={away} />
      )}

      {hasEvents && locked && (
        <AnalysisSection
          kicker={<><Activity className="h-3 w-3" /> Match momentum</>}
          meta={phase === "finished" ? "Full match" : "Live"}
        >
          <MomentumGraph events={events} homeName={home} awayName={away} phase={phase} kickoffISO={match.kickoff_at} />
        </AnalysisSection>
      )}

      {hasEvents && (
        <AnalysisSection
          kicker={<><Activity className="h-3 w-3" /> Goal & event timeline</>}
          meta={`${events.length} event${events.length === 1 ? "" : "s"}`}
        >
          <EventTimeline events={events} home={home} away={away} />
        </AnalysisSection>
      )}

      {hasStats && (
        <AnalysisSection kicker={<><Activity className="h-3 w-3" /> Match stats</>} meta={phase === "finished" ? "Final" : "Live"}>
          <StatsCompare home={stats.home} away={stats.away} homeName={home} awayName={away} />
        </AnalysisSection>
      )}

      {(hasLineups || phase === "pre" || phase === "lineups") && (
        <AnalysisSection kicker={<><Users className="h-3 w-3" /> Team sheets</>} meta={hasLineups ? "Confirmed XI" : "Pending"}>
          {hasLineups ? (
            <div className="space-y-5">
              {(lineups.home?.formation || lineups.away?.formation) && (
                <FormationPitch home={lineups.home} away={lineups.away} />
              )}
              <LineupSplit lineup={lineups.home} side="home" teamName={home} />
              <LineupSplit lineup={lineups.away} side="away" teamName={away} />
            </div>
          ) : (
            <p className="text-sm text-[var(--color-ink-muted)]">
              {phase === "lineups"
                ? "Confirmed lineups drop in the next hour — check back shortly."
                : "Lineups are released roughly 1 hour before kickoff."}
            </p>
          )}
        </AnalysisSection>
      )}

      {hasRatings && (
        <AnalysisSection kicker={<><Star className="h-3 w-3" /> Player ratings</>}>
          <div className="grid gap-5 md:grid-cols-2">
            <RatingsTable rows={ratings.home} title={home} />
            <RatingsTable rows={ratings.away} title={away} />
          </div>
        </AnalysisSection>
      )}

      {hasInjuries && (
        <AnalysisSection kicker={<><AlertTriangle className="h-3 w-3" /> Injury report</>}>
          <div className="grid gap-4 md:grid-cols-2">
            <InjuryList items={injuries.home} title={home} />
            <InjuryList items={injuries.away} title={away} />
          </div>
        </AnalysisSection>
      )}

      {hasH2H && (
        <AnalysisSection kicker={<><History className="h-3 w-3" /> Head to head</>} meta={`Last ${h2h.length}`}>
          <H2HList rows={h2h} />
        </AnalysisSection>
      )}

      {!hasLineups && !hasStats && !hasEvents && !hasH2H && phase === "pre" && (
        <StencilPanel>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Analytics warms up as kickoff nears. H2H and injury reports populate first, then lineups, then live stats once the whistle goes.
          </p>
        </StencilPanel>
      )}
    </>
  );
}

function AnalysisSection({ kicker, meta, children }: { kicker?: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="relative space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        {kicker && (
          <span className="flex min-w-0 items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
            {kicker}
          </span>
        )}
        {meta && (
          <span className="shrink-0 text-[10px] font-medium tracking-[0.02em] text-[var(--color-ink-muted)]">
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}


/* Compact key-stat grid — large readable tiles for the Summary tab on mobile. */
function KeyStatsGrid({ home, away, homeName, awayName }: { home: any; away: any; homeName: string; awayName: string }) {
  const rows: Array<{ key: string; label: string }> = [
    { key: "possession", label: "Possession" },
    { key: "shots_total", label: "Shots" },
    { key: "shots_on", label: "On target" },
    { key: "corners", label: "Corners" },
    { key: "xg", label: "xG" },
    { key: "passes_pct", label: "Pass %" },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="min-w-0 truncate text-left text-[var(--color-neon)]">{homeName}</span>
        <span className="shrink-0 text-center text-[var(--color-ink-muted)]">vs</span>
        <span className="min-w-0 truncate text-right">{awayName}</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {rows.map((r) => {
          const h = home?.[r.key];
          const a = away?.[r.key];
          if (h == null && a == null) return null;
          const hv = Number(h ?? 0);
          const av = Number(a ?? 0);
          const total = hv + av || 1;
          const hPct = (hv / total) * 100;
          const lead = hv === av ? null : hv > av ? "home" : "away";
          return (
            <div key={r.key} className="border border-[var(--color-surface-border)]/70 bg-[var(--color-surface)]/45 px-3.5 py-3">
              <div className="mb-2 grid grid-cols-[56px_1fr_56px] items-baseline gap-2">
                <span className={`font-display text-xl font-black tabular-nums ${lead === "home" ? "text-[var(--color-neon)]" : "text-[var(--color-ink)]"}`}>{h ?? "—"}</span>
                <span className="text-center text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{r.label}</span>
                <span className={`text-right font-display text-xl font-black tabular-nums ${lead === "away" ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/80"}`}>{a ?? "—"}</span>
              </div>
              <div className="flex h-2 overflow-hidden bg-[var(--color-surface-border)]/40">
                <div className="bg-[var(--color-neon)] transition-all duration-700" style={{ width: `${hPct}%` }} />
                <div className="bg-white/60 transition-all duration-700" style={{ width: `${100 - hPct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useLiveMinute(
  kickoffISO: string,
  status: string,
  opts: { liveElapsed?: number | null; liveStatusShort?: string | null } = {},
) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (status === "finished") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);
  if (status === "finished") return { label: "FT", isLive: false };

  // Prefer API-Football live status when available — handles HT, ET, breaks, and penalties correctly.
  const short = (opts.liveStatusShort ?? "").toUpperCase();
  const elapsed = typeof opts.liveElapsed === "number" ? opts.liveElapsed : null;
  if (short) {
    if (short === "HT") return { label: "HT", isLive: true };
    if (short === "BT") return { label: "BT", isLive: true };
    if (short === "P") return { label: "PEN", isLive: true };
    if (short === "SUSP" || short === "INT") return { label: short, isLive: true };
    if (short === "FT" || short === "AET" || short === "PEN") return { label: short, isLive: false };
    if (elapsed != null) {
      if (short === "ET") {
        // ET runs 90-120; some APIs report 1..30, others 91..120
        const m = elapsed <= 30 ? 90 + elapsed : elapsed;
        return { label: `${Math.min(120, m)}'`, isLive: true };
      }
      // 1H, 2H, LIVE
      return { label: `${elapsed}'`, isLive: true };
    }
  }

  // Fallback: wall-clock approximation (no API data yet)
  const kickoff = new Date(kickoffISO).getTime();
  const diffMin = Math.floor((now - kickoff) / 60000);
  if (diffMin < 0) return { label: "", isLive: false };
  if (diffMin <= 45) return { label: `${diffMin}'`, isLive: true };
  if (diffMin < 60) return { label: "HT", isLive: true };
  const second = diffMin - 15;
  if (second <= 90) return { label: `${second}'`, isLive: true };
  // After 90', don't keep counting blindly — likely FT or ET; show 90'+ until API confirms.
  return { label: `90'+`, isLive: true };
}

function MatchHero({
  match,
  phaseLabel,
  phase,
  homeGoals,
  awayGoals,
  lastEvent,
}: {
  match: NonNullable<AnalyticsBundle["match"]>;
  phaseLabel: string;
  phase: AnalyticsBundle["phase"];
  homeGoals: any[];
  awayGoals: any[];
  lastEvent?: any | null;
}) {
  const kickoff = new Date(match.kickoff_at);
  const dateStr = kickoff.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = kickoff.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  const [countdown, setCountdown] = useState("");
  useEffect(() => {
    if (match.status === "finished") return;
    const tick = () => {
      const ms = kickoff.getTime() - Date.now();
      if (ms <= 0) { setCountdown(""); return; }
      const h = Math.floor(ms / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      const s = Math.floor((ms % 60000) / 1000);
      setCountdown(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [match.kickoff_at, match.status]);

  const liveClock = useLiveMinute(match.kickoff_at, match.status, {
    liveElapsed: (match as any).live_elapsed,
    liveStatusShort: (match as any).live_status_short,
  });
  const isFinished = match.status === "finished";
  const isLive = phase === "live";
  const showScore = isFinished || match.home_score != null || isLive;
  void homeGoals; void awayGoals; void phaseLabel;

  const homeFlag = teamFlagUrl(match.home_team, 160);
  const awayFlag = teamFlagUrl(match.away_team, 160);

  const lastPlay = (() => {
    if (!isLive || !lastEvent) return null;
    const min = `${lastEvent.minute ?? ""}${lastEvent.extra_minute ? `+${lastEvent.extra_minute}` : ""}'`;
    const side = lastEvent.side === "home" ? match.home_team : match.away_team;
    const type = String(lastEvent.type || "").toLowerCase();
    const detail = String(lastEvent.detail || "").trim();
    const label =
      type === "goal" ? "Goal" :
      type === "card" ? (detail || "Card") :
      type === "subst" ? "Substitution" :
      type === "var" ? "VAR" :
      (detail || type || "Event");
    return { side, label, min };
  })();

  return (
    <article className="relative flex flex-col gap-6">
      {/* Title + status */}
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-[26px] font-semibold leading-[1.05] tracking-tight text-[var(--color-ink)] md:text-4xl">
          {match.home_team} <span className="text-[var(--color-ink-muted)]/70">vs</span> {match.away_team}
        </h1>
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-[0.02em]">
          {isLive ? (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
              </span>
              <span className="font-semibold uppercase tracking-[0.22em]">LIVE · {liveClock.label}</span>
            </span>
          ) : isFinished ? (
            <span className="font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">Full time</span>
          ) : countdown ? (
            <span className="text-[var(--color-ink-muted)]">
              Begins in <span className="font-semibold text-[var(--color-neon)]">{countdown}</span>
            </span>
          ) : (
            <span className="text-[var(--color-ink-muted)]">
              Kicks off <span className="text-[var(--color-ink)]">{dateStr} · {timeStr}</span>
            </span>
          )}
        </div>
      </div>

      {/* Scoreboard */}
      <div className="flex items-center justify-center gap-5 sm:gap-8 md:gap-12">
        <ScoreTeam name={match.home_team} flag={homeFlag} />
        <div className="flex flex-col items-center">
          {showScore ? (
            <div className="flex items-baseline gap-2 font-display leading-none tracking-tight">
              <span className="text-4xl font-semibold tabular-nums text-[var(--color-ink)] sm:text-5xl md:text-6xl">
                {match.home_score ?? 0}
              </span>
              <span className="text-2xl font-light text-[var(--color-ink-muted)]/50 sm:text-3xl">–</span>
              <span className="text-4xl font-semibold tabular-nums text-[var(--color-ink)] sm:text-5xl md:text-6xl">
                {match.away_score ?? 0}
              </span>
            </div>
          ) : (
            <span className="font-display text-xl font-light tracking-tight text-[var(--color-ink-muted)] sm:text-2xl">vs</span>
          )}
          {(match.penalty_home_score != null || match.penalty_away_score != null) && (
            <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
              Pens <span className="tabular-nums text-[var(--color-ink)]">{match.penalty_home_score ?? 0}–{match.penalty_away_score ?? 0}</span>
            </div>
          )}
        </div>
        <ScoreTeam name={match.away_team} flag={awayFlag} />
      </div>

      {/* Last play */}
      {lastPlay && (
        <div className="text-[11px] tracking-[0.02em] text-[var(--color-ink-muted)]">
          <span className="font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]/80">Last play</span>
          <span className="mx-2 opacity-40">·</span>
          <span className="text-[var(--color-ink)]">{lastPlay.side}</span>{" "}
          <span>{lastPlay.label}</span>{" "}
          <span className="tabular-nums text-[var(--color-ink-muted)]">({lastPlay.min})</span>
        </div>
      )}

      {/* Divider before graph */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-surface-border)] to-transparent" />
    </article>
  );
}

/* Scoreboard team cell — centered flag only. */
function ScoreTeam({ name, flag }: { name: string; flag: string | null }) {
  return (
    <div className="flex items-center justify-center">
      <div className="relative h-14 w-20 shrink-0 overflow-hidden sm:h-20 sm:w-28 md:h-24 md:w-32">
        {flag ? (
          <img src={flag} alt={`${name} flag`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--color-surface)] font-display text-[11px] font-semibold uppercase tracking-wider">
            {name.slice(0, 3)}
          </div>
        )}
      </div>
    </div>
  );
}



/* 90-minute strip with HT mark and event markers. */
function MatchProgress({ pct, cap = 90, markers }: { pct: number; cap?: number; markers: Array<{ side: "home"|"away"; kind: string; min: number | null; extra?: number | null; detail?: string }> }) {
  const isET = cap > 90;
  // HT sits at 45/cap. For ET also show a 90' tick.
  const htPct = (45 / cap) * 100;
  const ftPct = (90 / cap) * 100;
  return (
    <div className="mt-4">
      <div className="relative h-7">
        {/* Track */}
        <div className="absolute inset-x-0 top-3 h-1 bg-[var(--color-surface-border)]" />
        {/* Progress fill */}
        <div
          className="absolute top-3 left-0 h-1 bg-[var(--color-neon)] shadow-[0_0_10px_var(--color-neon-glow)] transition-all duration-1000"
          style={{ width: `${pct}%` }}
        />
        {/* HT tick */}
        <div className="absolute top-1.5 h-4 w-px bg-[var(--color-surface-border)]" style={{ left: `${htPct}%` }} />
        <span className="absolute -top-0.5 -translate-x-1/2 text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]" style={{ left: `${htPct}%` }}>HT</span>
        {/* 90' tick (visible once ET starts) */}
        {isET && (
          <>
            <div className="absolute top-1.5 h-4 w-px bg-[var(--color-surface-border)]" style={{ left: `${ftPct}%` }} />
            <span className="absolute -top-0.5 -translate-x-1/2 text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]" style={{ left: `${ftPct}%` }}>90'</span>
          </>
        )}
        {/* Markers */}
        {markers.map((m, i) => {
          const minute = Math.min(cap, (m.min ?? 0) + (m.extra ?? 0));
          const left = `${Math.min(100, (minute / cap) * 100)}%`;
          const isHome = m.side === "home";
          return (
            <div
              key={i}
              className="absolute"
              style={{ left, top: isHome ? 0 : 18, transform: "translateX(-50%)" }}
              title={`${minute}' — ${m.detail ?? "Goal"}`}
            >
              <GoalIcon size={11} className={isHome ? "text-[var(--color-neon)]" : "text-white"} />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-display text-[9px] font-bold tabular-nums text-[var(--color-ink-muted)]">
        <span>0'</span><span>{Math.round(cap / 2)}'</span><span>{cap}'</span>
      </div>
    </div>
  );
}

/* Compact betting closed/settled ribbon — replaces a full panel with a thin status bar. */
function BettingRibbon({ phase }: { phase: AnalyticsBundle["phase"] }) {
  const finished = phase === "finished";
  return (
    <div className="relative flex items-center justify-between border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-4 py-2.5">
      <Corner pos="tl" /><Corner pos="br" />
      <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.28em]">
        {finished ? (
          <WhistleIcon size={12} className="text-[var(--color-ink-muted)]" />
        ) : (
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
        )}
        <span className={finished ? "text-[var(--color-ink-muted)]" : "text-destructive"}>
          {finished ? "Full time" : "Markets closed"}
        </span>
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        {finished ? "All bets settled" : "In play · live coverage below"}
      </span>
    </div>
  );
}


function MicroStat({ label, h, a }: { label: string; h: any; a: any }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-display text-xs font-bold tabular-nums">
        <span className="text-[var(--color-neon)]">{h ?? "—"}</span>
        <span className="mx-1 text-[var(--color-ink-muted)]">·</span>
        <span>{a ?? "—"}</span>
      </div>
      <div className="text-[9px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">{label}</div>
    </div>
  );
}

function MomentumStrip({ stats, homeName, awayName }: { stats: AnalyticsBundle["stats"]; homeName: string; awayName: string }) {
  const hPoss = Number(stats.home?.possession ?? 0);
  const aPoss = Number(stats.away?.possession ?? 0);
  const total = hPoss + aPoss || 1;
  const hPct = (hPoss / total) * 100;
  return (
    <div className="relative overflow-hidden border border-[var(--color-surface-border)] bg-[var(--color-surface-2)] px-4 py-3">
      <Corner pos="tl" /><Corner pos="br" />
      <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        <span>{homeName}</span>
        <span className="text-[var(--color-neon)]">Possession</span>
        <span>{awayName}</span>
      </div>
      <div className="flex h-2 overflow-hidden bg-[var(--color-surface)]">
        <div className="bg-[var(--color-neon)] transition-all duration-700" style={{ width: `${hPct}%` }} />
        <div className="bg-white/40 transition-all duration-700" style={{ width: `${100 - hPct}%` }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] font-display font-bold tabular-nums">
        <span className="text-[var(--color-neon)]">{hPoss || 0}%</span>
        <span className="text-[var(--color-ink-muted)]">{aPoss || 0}%</span>
      </div>
    </div>
  );
}

/* SofaScore-style Attack Momentum — vertical bars from a center baseline.
 * Home bars grow upward (neon, analytics primary); away bars grow downward
 * (analytics secondary blue). Team flags anchor the baseline on the left,
 * event icons ride the top rail, HT splits the pitch into two halves. */
function MomentumGraph({
  events,
  homeName,
  awayName,
  phase,
  kickoffISO,
}: {
  events: any[];
  homeName: string;
  awayName: string;
  phase: AnalyticsBundle["phase"];
  kickoffISO: string;
}) {
  const HOME_COLOR = "var(--color-neon)";
  const AWAY_COLOR = "#f472b6"; // pink — away accent (blue is reserved for Draw)
  const CAP = 95;
  const SIGMA = 3.2;

  const liveClock = useLiveMinute(kickoffISO, phase === "finished" ? "finished" : "live");
  const liveMinute = (() => {
    if (phase === "finished") return CAP;
    const m = parseInt(String(liveClock.label).replace(/\D/g, ""), 10);
    return Number.isFinite(m) ? Math.min(CAP, Math.max(0, m)) : 0;
  })();

  const { homeSeries, awaySeries, maxVal } = useMemo(() => {
    const weightFor = (e: any): number => {
      const t = String(e?.type ?? "").toLowerCase();
      const d = String(e?.detail ?? "").toLowerCase();
      if (t === "goal") return d.includes("own") ? 6 : 12;
      if (t === "card") return d.includes("red") ? 5 : 2.5;
      if (t === "var") return 2;
      if (t === "subst") return 1.2;
      return 1.5;
    };
    const h = new Array(CAP + 1).fill(0);
    const a = new Array(CAP + 1).fill(0);
    for (const e of events) {
      const min = Math.min(CAP, Math.max(0, (e.minute ?? 0) + (e.extra_minute ?? 0)));
      const w = weightFor(e);
      const target = e.side === "home" ? h : e.side === "away" ? a : null;
      if (!target) continue;
      for (let i = 0; i <= CAP; i++) {
        const dx = i - min;
        target[i] += w * Math.exp(-(dx * dx) / (2 * SIGMA * SIGMA));
      }
    }
    const max = Math.max(1, ...h, ...a);
    return { homeSeries: h, awaySeries: a, maxVal: max };
  }, [events]);

  const hasAny = homeSeries.some((v) => v > 0) || awaySeries.some((v) => v > 0);
  const homeFlag = teamFlagUrl(homeName, 80);
  const awayFlag = teamFlagUrl(awayName, 80);

  // Layout math
  const W = 600;
  const H = 180;
  const FLAG_COL = 34;
  const EVENT_ROW = 22;
  const PAD_T = EVENT_ROW;
  const PAD_B = 14;
  const HALF_GAP = 6;
  const chartLeft = FLAG_COL + 6;
  const chartRight = W - 4;
  const innerW = chartRight - chartLeft;
  const halfW = (innerW - HALF_GAP) / 2;
  const innerH = H - PAD_T - PAD_B;
  const midY = PAD_T + innerH / 2;

  const xForMinute = (m: number) => {
    if (m <= 45) return chartLeft + (m / 45) * halfW;
    const t = Math.min(1, (m - 45) / 45);
    return chartLeft + halfW + HALF_GAP + t * halfW;
  };

  const barW = halfW / 45 * 0.72;
  const halfH = innerH / 2;

  const timelineEvents = events.filter((e: any) => {
    const t = String(e?.type ?? "").toLowerCase();
    return t === "goal" || t === "card";
  });

  return (
    <div className="relative rounded-lg border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]/40 px-2 py-3">
      <div className="mb-2 flex items-center justify-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
        <span>Attack momentum</span>
      </div>

      {hasAny ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
          <defs>
            <clipPath id="mg-flag-home"><circle cx={FLAG_COL / 2 + 2} cy={midY - halfH / 2} r="10" /></clipPath>
            <clipPath id="mg-flag-away"><circle cx={FLAG_COL / 2 + 2} cy={midY + halfH / 2} r="10" /></clipPath>
          </defs>

          {/* Half-pitch backgrounds */}
          <rect x={chartLeft} y={PAD_T} width={halfW} height={innerH}
            fill="var(--color-surface)" opacity="0.55" rx="2" />
          <rect x={chartLeft + halfW + HALF_GAP} y={PAD_T} width={halfW} height={innerH}
            fill="var(--color-surface)" opacity="0.55" rx="2" />

          {/* Center baseline */}
          <line x1={chartLeft} x2={chartRight} y1={midY} y2={midY}
            stroke="var(--color-surface-border)" strokeWidth="0.8" />

          {/* Home bars (up) */}
          {homeSeries.map((v, i) => {
            if (v <= 0.01) return null;
            const h = (v / maxVal) * halfH;
            const x = xForMinute(i) - barW / 2;
            return <rect key={`h-${i}`} x={x} y={midY - h} width={barW} height={h} fill={HOME_COLOR} opacity="0.9" />;
          })}
          {/* Away bars (down) */}
          {awaySeries.map((v, i) => {
            if (v <= 0.01) return null;
            const h = (v / maxVal) * halfH;
            const x = xForMinute(i) - barW / 2;
            return <rect key={`a-${i}`} x={x} y={midY} width={barW} height={h} fill={AWAY_COLOR} opacity="0.85" />;
          })}

          {/* Team flags */}
          {homeFlag && (
            <>
              <circle cx={FLAG_COL / 2 + 2} cy={midY - halfH / 2} r="11" fill="var(--color-surface-2)" stroke={HOME_COLOR} strokeWidth="1.2" />
              <image href={homeFlag} x={FLAG_COL / 2 + 2 - 10} y={midY - halfH / 2 - 10} width="20" height="20" clipPath="url(#mg-flag-home)" preserveAspectRatio="xMidYMid slice" />
            </>
          )}
          {awayFlag && (
            <>
              <circle cx={FLAG_COL / 2 + 2} cy={midY + halfH / 2} r="11" fill="var(--color-surface-2)" stroke={AWAY_COLOR} strokeWidth="1.2" />
              <image href={awayFlag} x={FLAG_COL / 2 + 2 - 10} y={midY + halfH / 2 - 10} width="20" height="20" clipPath="url(#mg-flag-away)" preserveAspectRatio="xMidYMid slice" />
            </>
          )}

          {/* Event markers on top rail */}
          {timelineEvents.map((e: any, i: number) => {
            const min = Math.min(CAP, Math.max(0, (e.minute ?? 0) + (e.extra_minute ?? 0)));
            const x = xForMinute(min);
            const t = String(e?.type ?? "").toLowerCase();
            const d = String(e?.detail ?? "").toLowerCase();
            const isRed = t === "card" && d.includes("red");
            const isGoal = t === "goal";
            const y = EVENT_ROW / 2;
            if (isGoal) {
              return (
                <g key={`ev-${i}`}>
                  <circle cx={x} cy={y} r="6.5" fill="none" stroke="var(--color-neon)" strokeWidth="1.2" />
                  <circle cx={x} cy={y} r="2" fill="var(--color-neon)" />
                </g>
              );
            }
            if (isRed) {
              return <rect key={`ev-${i}`} x={x - 3.5} y={y - 5} width="7" height="10" fill="#ef4444" rx="1" />;
            }
            return <rect key={`ev-${i}`} x={x - 3.5} y={y - 5} width="7" height="10" fill="#facc15" rx="1" />;
          })}

          {/* HT band */}
          <line x1={chartLeft + halfW + HALF_GAP / 2} x2={chartLeft + halfW + HALF_GAP / 2}
            y1={PAD_T} y2={PAD_T + innerH}
            stroke="var(--color-ink)" strokeOpacity="0.6" strokeWidth="1" />

          {/* Live cursor */}
          {phase === "live" && liveMinute > 0 && (
            <line x1={xForMinute(liveMinute)} x2={xForMinute(liveMinute)}
              y1={PAD_T} y2={PAD_T + innerH}
              stroke="hsl(var(--destructive))" strokeWidth="1" strokeDasharray="2 2" />
          )}

          {/* Axis labels */}
          <text x={chartLeft} y={H - 2} fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">0'</text>
          <text x={chartLeft + halfW} y={H - 2} textAnchor="end" fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">45'</text>
          <text x={chartLeft + halfW + HALF_GAP} y={H - 2} fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">46'</text>
          <text x={chartRight} y={H - 2} textAnchor="end" fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">90'</text>
        </svg>
      ) : (
        <p className="py-6 text-center text-xs text-[var(--color-ink-muted)]">Momentum builds once events roll in.</p>
      )}

      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] font-medium uppercase tracking-[0.22em] text-[var(--color-ink-muted)]">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: HOME_COLOR }} /> {homeName}</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: AWAY_COLOR }} /> {awayName}</span>
      </div>
    </div>
  );
}

function TeamBlock({ name, goals = [], align = "left", accent = "home" }: { name: string; goals?: any[]; align?: "left" | "right"; accent?: "home" | "away" }) {
  const url = teamFlagUrl(name, 160);
  const accentCls = accent === "home" ? "border-[var(--color-neon)]/50 shadow-[0_0_18px_-6px_var(--color-neon-glow)]" : "border-white/40";
  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`relative h-14 w-20 overflow-hidden border ${accentCls}`}>
        {url ? (
          <img src={url} alt={`${name} flag`} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--color-surface)] font-display text-[11px] font-black uppercase tracking-wider">
            {name.slice(0, 3)}
          </div>
        )}
        <span className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-black/30" />
      </div>
      <span className="max-w-[120px] truncate text-center font-display text-[11px] font-black uppercase tracking-[0.18em]">{name}</span>
      {goals.length > 0 && (
        <ul className={`flex w-full flex-col gap-0.5 text-[10px] leading-tight ${align === "right" ? "items-end" : "items-start"}`}>
          {goals.map((g, i) => {
            const min = `${g.minute ?? ""}${g.extra_minute ? `+${g.extra_minute}` : ""}'`;
            const isPen = String(g.detail || "").toLowerCase().includes("penalty");
            const isOG = String(g.detail || "").toLowerCase().includes("own");
            const last = (g.player_name || "").split(" ").slice(-1)[0];
            return (
              <li key={i} className={`flex items-center gap-1 text-[var(--color-ink)] ${align === "right" ? "flex-row-reverse" : ""}`}>
                <GoalIcon size={9} className={accent === "home" ? "text-[var(--color-neon)]" : "text-white"} />
                <span className="font-semibold truncate max-w-[90px]">{last}</span>
                <span className="font-display tabular-nums text-[var(--color-ink-muted)]">{min}</span>
                {isPen && <span className="text-[var(--color-ink-muted)]">(P)</span>}
                {isOG && <span className="text-[var(--color-ink-muted)]">(OG)</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}


/* ---------- Lineups (SofaScore-inspired) ---------- */

function LineupSplit({ lineup, side, teamName }: { lineup: any; side: "home" | "away"; teamName: string }) {
  if (!lineup) {
    return (
      <div className="text-xs text-[var(--color-ink-muted)]">
        {teamName}: lineup not yet published.
      </div>
    );
  }
  const starters: LineupPlayer[] = lineup.starters ?? [];
  const subs: LineupPlayer[] = lineup.substitutes ?? [];
  const accent = side === "home" ? "var(--color-neon)" : "#F3F4F6";
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between border-b border-dashed border-[var(--color-surface-border)] pb-2">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: accent, boxShadow: side === "home" ? `0 0 8px ${accent}` : "none" }}
          />
          <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{teamName}</span>
        </div>
        {lineup.formation && (
          <span className="font-display text-[11px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
            {lineup.formation}
          </span>
        )}
      </div>

      <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
        Starting XI
      </div>
      <ul className="mt-2 divide-y divide-dashed divide-[var(--color-surface-border)]/60">
        {starters.map((p, i) => (
          <PlayerRow key={`s-${i}`} player={p} accent={accent} />
        ))}
      </ul>

      {subs.length > 0 && (
        <>
          <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Bench
          </div>
          <ul className="mt-2 divide-y divide-dashed divide-[var(--color-surface-border)]/50">
            {subs.map((p, i) => (
              <PlayerRow key={`b-${i}`} player={p} accent={accent} dim />
            ))}
          </ul>
        </>
      )}
      {lineup.coach_name && (
        <div className="mt-4 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          <span>Coach</span>
          <span className="text-[var(--color-ink)]">{lineup.coach_name}</span>
        </div>
      )}
    </div>
  );
}

function PlayerRow({ player, accent, dim = false }: { player: LineupPlayer; accent: string; dim?: boolean }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 py-2">
      <span
        className="grid h-6 w-6 place-items-center rounded-full border font-display text-[10px] font-bold tabular-nums"
        style={{
          borderColor: dim ? "var(--color-surface-border)" : accent,
          color: dim ? "var(--color-ink-muted)" : accent,
        }}
      >
        {player.number ?? "–"}
      </span>
      <span className={`truncate text-sm ${dim ? "text-[var(--color-ink-muted)]" : "text-[var(--color-ink)]"}`}>
        {player.name}
      </span>
      {player.pos && (
        <span className="rounded-sm border border-[var(--color-surface-border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
          {player.pos}
        </span>
      )}
    </li>
  );
}


/* SVG pitch + player dots, positioned by API-Football grid "row:col" (1-based). */
function FormationPitch({ home, away }: { home: any; away: any }) {
  // Pitch is horizontal: home defends left half, away defends right half.
  // API grid is "row:col" where row=1 is the back line. Higher rows are further upfield.
  // We map home grid to LEFT half (back line at x=10%); away to RIGHT half (back line at x=90%, mirrored).
  function placePlayers(lineup: any, isHome: boolean) {
    const starters: LineupPlayer[] = lineup?.starters ?? [];
    if (!starters.length) return [];
    // Determine max rows per side so we can spread them across the half.
    const rows = starters
      .map((p) => Number(String(p.grid ?? "").split(":")[0]) || 0)
      .filter((n) => n > 0);
    const maxRow = Math.max(1, ...rows);
    return starters.map((p) => {
      const [rawRow, rawCol] = String(p.grid ?? "").split(":").map((x) => Number(x) || 0);
      // group players by row to compute col positions when grid missing
      const sameRow = starters.filter(
        (q) => Number(String(q.grid ?? "").split(":")[0]) === rawRow,
      );
      const colCount = Math.max(1, sameRow.length);
      const idxInRow = Math.max(1, rawCol || sameRow.indexOf(p) + 1);
      // x: across the half (10% .. 45%); y: vertically (10% .. 90%)
      const halfMin = isHome ? 6 : 54;
      const halfMax = isHome ? 46 : 94;
      const rowFrac = rawRow > 0 ? (rawRow - 1) / Math.max(1, maxRow - 1) : 0.5;
      const x = halfMin + rowFrac * (halfMax - halfMin);
      // y across vertical
      const yFrac = (idxInRow - 0.5) / colCount;
      const y = 8 + yFrac * 84;
      return { x: isHome ? x : 100 - (x - 50) - 50 + (halfMin + halfMax) / 2 - (halfMin + halfMax) / 2, y, player: p };
    }).map(({ x, y, player }, _i, _arr) => ({ x, y, player }));
  }
  // Simplify: just mirror x for away by `100 - x` of the home mapping
  function place(lineup: any, isHome: boolean) {
    const starters: LineupPlayer[] = lineup?.starters ?? [];
    if (!starters.length) return [];
    const rowsArr = starters.map((p) => Number(String(p.grid ?? "").split(":")[0]) || 0);
    const maxRow = Math.max(1, ...rowsArr);
    return starters.map((p, idx) => {
      const [rawRow, rawCol] = String(p.grid ?? "").split(":").map((x) => Number(x) || 0);
      const sameRow = starters.filter(
        (q) => Number(String(q.grid ?? "").split(":")[0]) === (rawRow || 0),
      );
      const colCount = Math.max(1, sameRow.length);
      const colIdx = rawCol > 0 ? rawCol : sameRow.indexOf(p) + 1;
      const rowFrac = rawRow > 0 ? (rawRow - 1) / Math.max(1, maxRow - 1) : idx / Math.max(1, starters.length - 1);
      const xHome = 6 + rowFrac * 40; // 6..46
      const x = isHome ? xHome : 100 - xHome;
      const yFrac = (colIdx - 0.5) / colCount;
      const y = 8 + yFrac * 84;
      return { x, y, player: p };
    });
  }
  const homeDots = place(home, true);
  const awayDots = place(away, false);

  return (
    <div className="overflow-hidden border border-[var(--color-surface-border)] bg-[#04110A]">
      <svg viewBox="0 0 100 100" className="block h-auto w-full">
        {/* Pitch */}
        <rect x="0" y="0" width="100" height="100" fill="#04110A" />
        <g stroke="var(--color-neon)" strokeOpacity="0.45" strokeWidth="0.3" fill="none">
          <rect x="2" y="2" width="96" height="96" />
          <line x1="50" y1="2" x2="50" y2="98" />
          <circle cx="50" cy="50" r="9" />
          <circle cx="50" cy="50" r="0.6" fill="var(--color-neon)" />
          {/* boxes */}
          <rect x="2" y="22" width="14" height="56" />
          <rect x="84" y="22" width="14" height="56" />
          <rect x="2" y="36" width="6" height="28" />
          <rect x="92" y="36" width="6" height="28" />
        </g>
        {/* Players */}
        {homeDots.map((d, i) => (
          <PlayerDot key={`h-${i}`} x={d.x} y={d.y} number={d.player.number} name={d.player.name} color="#00FFA3" />
        ))}
        {awayDots.map((d, i) => (
          <PlayerDot key={`a-${i}`} x={d.x} y={d.y} number={d.player.number} name={d.player.name} color="#F3F4F6" />
        ))}
      </svg>
    </div>
  );
}

function PlayerDot({ x, y, number, name, color }: { x: number; y: number; number: number | null; name: string; color: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r="2.4" fill={color} stroke="#04110A" strokeWidth="0.4" />
      <text x={x} y={y + 0.9} textAnchor="middle" fontSize="2.2" fontWeight="700" fill="#04110A">
        {number ?? ""}
      </text>
      <text x={x} y={y + 5.4} textAnchor="middle" fontSize="2" fill={color} opacity="0.85">
        {(name || "").split(" ").slice(-1)[0]}
      </text>
    </g>
  );
}

/* ---------- Stats compare ---------- */

function StatsCompare({ home, away, homeName: _homeName, awayName: _awayName }: { home: any; away: any; homeName: string; awayName: string }) {
  // SofaScore-style: value | label | value with a single centre-anchored bar underneath.
  // Bars grow outward from the middle; the leading side is neon, the trailing side is muted.
  const groups: Array<{ title?: string; rows: Array<{ key: string; label: string; suffix?: string }> }> = [
    {
      title: "Possession",
      rows: [
        { key: "possession", label: "Ball possession", suffix: "%" },
      ],
    },
    {
      title: "Shots",
      rows: [
        { key: "shots_total", label: "Total shots" },
        { key: "shots_on", label: "Shots on target" },
        { key: "xg", label: "Expected goals (xG)" },
      ],
    },
    {
      title: "Attack",
      rows: [
        { key: "corners", label: "Corner kicks" },
        { key: "fouls", label: "Fouls" },
      ],
    },
    {
      title: "Passes",
      rows: [
        { key: "passes_accurate", label: "Accurate passes" },
        { key: "passes_pct", label: "Pass accuracy", suffix: "%" },
      ],
    },
    {
      title: "Defending",
      rows: [
        { key: "saves", label: "Goalkeeper saves" },
        { key: "yellow_cards", label: "Yellow cards" },
        { key: "red_cards", label: "Red cards" },
      ],
    },
  ];

  return (
    <div className="divide-y divide-dashed divide-[var(--color-surface-border)]/45">
      {groups.map((g) => {
        const visible = g.rows.filter((r) => home?.[r.key] != null || away?.[r.key] != null);
        if (!visible.length) return null;
        return (
          <div key={g.title} className="py-4 first:pt-0 last:pb-0">
            {g.title && (
              <div className="mb-3 text-[10px] font-black uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
                {g.title}
              </div>
            )}
            <div className="space-y-3.5">
              {visible.map((r) => {
                const h = home?.[r.key];
                const a = away?.[r.key];
                const hv = Number(h ?? 0);
                const av = Number(a ?? 0);
                const max = Math.max(hv, av, 1);
                const hPct = (hv / max) * 100;
                const aPct = (av / max) * 100;
                const homeLeads = hv > av;
                const awayLeads = av > hv;
                const fmt = (v: any) => (v == null ? "—" : `${v}${r.suffix ?? ""}`);
                const HOME_COLOR = "var(--color-neon)";
                const AWAY_COLOR = "#f472b6";
                return (
                  <div key={r.key}>
                    <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-baseline gap-3">
                      <span
                        className="text-left font-display text-base font-black tabular-nums"
                        style={{ color: homeLeads ? HOME_COLOR : "var(--color-ink)" }}
                      >
                        {fmt(h)}
                      </span>
                      <span className="text-center text-[11px] font-medium tracking-tight text-[var(--color-ink-muted)]">
                        {r.label}
                      </span>
                      <span
                        className="text-right font-display text-base font-black tabular-nums"
                        style={{ color: awayLeads ? AWAY_COLOR : "var(--color-ink)" }}
                      >
                        {fmt(a)}
                      </span>
                    </div>
                    {/* SofaScore-style: two independent tracks. Home fills from its outside edge (left→right); away fills from its outside edge (right→left). Both grow toward the centre. */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="relative h-1.5 overflow-hidden rounded-sm bg-[var(--color-surface)]">
                        <div
                          className={`absolute inset-y-0 left-0 transition-all duration-700 ${homeLeads ? "shadow-[0_0_6px_var(--color-neon-glow)]" : ""}`}
                          style={{
                            width: `${hPct}%`,
                            background: homeLeads ? HOME_COLOR : "color-mix(in oklab, var(--color-neon) 45%, transparent)",
                          }}
                        />
                      </div>
                      <div className="relative h-1.5 overflow-hidden rounded-sm bg-[var(--color-surface)]">
                        <div
                          className="absolute inset-y-0 right-0 transition-all duration-700"
                          style={{
                            width: `${aPct}%`,
                            background: awayLeads ? AWAY_COLOR : "color-mix(in oklab, #f472b6 45%, transparent)",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/* ---------- Event timeline ---------- */

function EventTimeline({ events, home, away, compact }: { events: any[]; home: string; away: string; compact?: boolean }) {
  // Newest first, but group with HT/FT dividers based on minute
  const ordered = [...events].sort((a, b) => {
    const am = (a.minute ?? 0) + (a.extra_minute ?? 0);
    const bm = (b.minute ?? 0) + (b.extra_minute ?? 0);
    return bm - am;
  });
  const hasMore = !compact && ordered.length > 8;
  const HOME_COLOR = "var(--color-neon)";
  const AWAY_COLOR = "#f472b6";

  const rows: Array<{ kind: "event"; e: any } | { kind: "divider"; label: string }> = [];
  let insertedHT = false;
  let insertedFT = false;
  for (const e of ordered) {
    const m = (e.minute ?? 0) + (e.extra_minute ?? 0);
    if (!insertedFT && m >= 90) { rows.push({ kind: "divider", label: "Full time" }); insertedFT = true; }
    if (!insertedHT && m <= 45) {
      // insert HT before we go below 45
      if (rows.length && rows[rows.length - 1].kind === "event") {
        rows.push({ kind: "divider", label: "Half time" });
        insertedHT = true;
      }
    }
    rows.push({ kind: "event", e });
  }

  return (
    <div className="relative">
      <div className={compact ? "" : "md:max-h-[460px] md:overflow-y-auto md:pr-1"}>
        <ul className="relative">
          {/* Center rail */}
          <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[var(--color-surface-border)]" />
          {rows.map((row, idx) => {
            if (row.kind === "divider") {
              return (
                <li key={`div-${idx}`} className="relative my-3 flex items-center justify-center">
                  <span className="relative z-10 border border-[var(--color-surface-border)] bg-[var(--color-surface)] px-2 py-0.5 font-display text-[9px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
                    {row.label}
                  </span>
                </li>
              );
            }
            const e = row.e;
            const isHome = e.side === "home";
            const isAway = e.side === "away";
            const sideColor = isHome ? HOME_COLOR : AWAY_COLOR;
            const minute = `${e.minute ?? "—"}${e.extra_minute ? `+${e.extra_minute}` : ""}'`;
            const detail = String(e.detail ?? e.type ?? "").toLowerCase();
            const isGoal = String(e.type ?? "").toLowerCase() === "goal";
            const sideLabel = isHome ? home : isAway ? away : "";

            const Card = (
              <div className={`flex min-w-0 items-center gap-2 py-1.5 ${isHome ? "flex-row" : "flex-row-reverse"} ${isGoal ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/90"}`}>
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border bg-[var(--color-surface-2)]"
                  style={{ borderColor: sideColor }}
                >
                  {eventMark(e.e_type ?? e.type, e.detail, 12)}
                </span>
                <div className={`min-w-0 ${isHome ? "text-left" : "text-right"}`}>
                  <div className={`truncate text-sm ${isGoal ? "font-semibold" : "font-medium"}`}>
                    {e.player_name ?? e.detail ?? e.type}
                  </div>
                  {(e.assist_name || detail) && (
                    <div className="truncate text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                      {e.assist_name ? `assist ${e.assist_name}` : detail}
                      {sideLabel && <span className="opacity-60"> · {sideLabel}</span>}
                    </div>
                  )}
                </div>
              </div>
            );

            return (
              <li
                key={e.id ?? `e-${idx}`}
                className="relative grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-center border-b border-dashed border-[var(--color-surface-border)]/60 last:border-b-0"
              >
                {/* Left column (home) */}
                <div className={`flex justify-end pr-2 ${isHome ? "" : "opacity-0 pointer-events-none"}`}>
                  {isHome ? Card : null}
                </div>
                {/* Minute node */}
                <div className="relative flex items-center justify-center">
                  <span
                    className="relative z-10 grid h-9 w-9 place-items-center rounded-full border bg-[var(--color-surface)] font-display text-[10px] font-black tabular-nums"
                    style={{
                      borderColor: isHome ? HOME_COLOR : isAway ? AWAY_COLOR : "var(--color-surface-border)",
                      color: "var(--color-ink)",
                    }}
                  >
                    {minute}
                  </span>
                </div>
                {/* Right column (away) */}
                <div className={`flex justify-start pl-2 ${isAway ? "" : "opacity-0 pointer-events-none"}`}>
                  {isAway ? Card : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {hasMore && (
        <>
          <div aria-hidden className="pointer-events-none absolute bottom-0 inset-x-0 h-10 bg-gradient-to-t from-[var(--color-surface)] to-transparent" />
          <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
            Scroll for more events
          </div>
        </>
      )}
    </div>
  );
}



/* ---------- Injuries ---------- */

function InjuryList({ items, title }: { items: any[]; title: string }) {
  return (
    <div>
      <div className="mb-2 border-b border-dashed border-[var(--color-surface-border)] pb-1 text-[11px] font-bold uppercase tracking-[0.22em]">{title}</div>
      <ul className="space-y-1 text-xs">
        {items.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-2">
            <span className="truncate">{i.player_name}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{i.reason ?? i.type ?? "Out"}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Player ratings ---------- */

function RatingsTable({ rows, title }: { rows: any[]; title: string }) {
  const sorted = [...rows].sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
  const top = sorted.find((r) => r.rating != null)?.rating ?? null;
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between border-b border-dashed border-[var(--color-surface-border)] pb-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{title}</span>
        {top != null && (
          <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Top <span className="font-display text-[var(--color-neon)]">{Number(top).toFixed(1)}</span>
          </span>
        )}
      </div>
      <ul className="divide-y divide-dashed divide-[var(--color-surface-border)]/60">
        {rows.slice(0, 14).map((r) => {
          const isTop = r.rating != null && r.rating === top;
          return (
            <li key={r.id} className="grid grid-cols-[24px_minmax(0,1fr)_auto_auto] items-center gap-3 py-2">
              <span className="text-right font-display text-[10px] font-bold tabular-nums text-[var(--color-ink-muted)]">
                {r.number ?? ""}
              </span>
              <span className={`truncate text-sm ${isTop ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]"}`}>
                {r.player_name}
              </span>
              <span className="rounded-sm border border-[var(--color-surface-border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
                {r.position ?? "–"}
              </span>
              <RatingPill rating={r.rating} highlight={isTop} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RatingPill({ rating, highlight = false }: { rating: number | null; highlight?: boolean }) {
  if (rating == null) {
    return (
      <span className="grid h-7 w-11 place-items-center rounded-sm border border-dashed border-[var(--color-surface-border)] font-display text-xs font-bold tabular-nums text-[var(--color-ink-muted)]">
        —
      </span>
    );
  }
  const n = Number(rating);
  const bg =
    n >= 8 ? "var(--color-neon)" : n >= 7 ? "#3B82F6" : n >= 6 ? "#64748B" : "#E11D48";
  const fg = n >= 8 || n >= 7 || n < 6 ? "#04110A" : "#F3F4F6";
  return (
    <span
      className="grid h-7 w-11 place-items-center rounded-sm font-display text-xs font-bold tabular-nums"
      style={{
        background: bg,
        color: fg,
        boxShadow: highlight && n >= 8 ? `0 0 12px color-mix(in oklab, ${bg} 55%, transparent)` : undefined,
      }}
    >
      {n.toFixed(1)}
    </span>
  );
}


/* ---------- H2H ---------- */

function H2HList({ rows }: { rows: any[] }) {
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.slice(0, 8).map((f, i) => {
        const date = f.date ? new Date(f.date).toLocaleDateString(undefined, { year: "2-digit", month: "short", day: "numeric" }) : "";
        return (
          <li key={i} className="grid grid-cols-[80px_1fr_auto_1fr] items-baseline gap-2 border-b border-dashed border-[var(--color-surface-border)]/60 pb-1 last:border-0">
            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{date}</span>
            <span className="truncate text-right">{f.home}</span>
            <span className="font-display font-bold tabular-nums">{f.home_goals ?? "?"} – {f.away_goals ?? "?"}</span>
            <span className="truncate">{f.away}</span>
          </li>
        );
      })}
    </ul>
  );
}
