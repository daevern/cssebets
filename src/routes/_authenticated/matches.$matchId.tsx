import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Activity, Users, AlertTriangle, History, Star } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { getMatchAnalytics, type AnalyticsBundle, type LineupPlayer } from "@/lib/match-analytics.functions";
import { MarketTabs } from "@/components/matches/MarketTabs";
import { Corner, StencilPanel } from "@/components/ui/page-shell";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { eventMark, WhistleIcon, PitchIcon, GoalIcon, YellowCardIcon, RedCardIcon } from "@/components/matches/MatchIcons";
import { MarketAnalyticsCard } from "@/components/matches/MarketAnalyticsCard";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/matches/$matchId")({
  head: () => ({ meta: [{ title: "Match analytics — cssebets" }] }),
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
    <div className="relative min-h-screen text-[var(--ink)]">
      <div className="relative mx-auto flex max-w-3xl flex-col gap-6 px-5 pt-8 md:px-8 md:pt-12">
        <header className="flex items-baseline justify-between">
          <Link
            to="/matches"
            className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Matches
          </Link>
          <Link to="/dashboard"><CsseLogo size={20} /></Link>
        </header>


        {isLoading || !data ? (
          <div className="grid place-items-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-neon)]" />
          </div>
        ) : !data.match ? (
          <StencilPanel><div className="text-center text-sm text-[var(--color-ink-muted)]">Match not found.</div></StencilPanel>
        ) : (
          <Analytics bundle={data} />
        )}

        <footer className="mt-6 flex items-center justify-between border-t border-dashed border-[var(--color-surface-border)] pt-5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)]">
          <Link to="/dashboard" className="flex items-center gap-2 hover:text-[var(--color-ink)]"><CsseLogo size={16} /></Link>
          <span>© {new Date().getFullYear()} <BrandText /></span>
        </footer>
      </div>
    </div>
  );
}

type TabKey = "summary" | "stats" | "lineups" | "events" | "h2h";

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

  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: "summary", label: "Summary", show: true },
    { key: "stats", label: "Stats", show: hasStats },
    { key: "lineups", label: "Lineups", show: hasLineups || phase === "pre" || phase === "lineups" },
    { key: "events", label: "Events", show: hasEvents },
    { key: "h2h", label: "H2H", show: hasH2H },
  ].filter((t) => t.show) as any;

  const [tab, setTab] = useState<TabKey>("summary");

  return (
    <>
      <MatchHero
        match={match}
        phaseLabel={phaseLabel}
        phase={phase}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
      />

      {/* Market Analytics — historical odds / implied probability */}
      <MarketAnalyticsCard matchId={match.id} />

      {/* Markets — no framing, just the content */}
      {!locked && (
        <section className="py-10">
          <div className="mb-6">
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--ink-faint)]">Markets</p>
            <h3 className="mt-1 font-display text-2xl font-medium tracking-tight md:text-3xl">
              Place your prediction<span className="text-[var(--ink-faint)]">.</span>
            </h3>
          </div>
          <MarketTabs matchId={match.id} locked={false} bettingBlocked={false} suspendedMarkets={[]} />
        </section>
      )}
      {locked && <BettingRibbon phase={phase} />}

      {/* Sticky section tabs — flat text, no boxes */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-[var(--surface-hairline)] bg-[var(--surface)]/85 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
        <div className="flex gap-6 overflow-x-auto md:justify-center">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative shrink-0 py-1 text-[12px] font-medium whitespace-nowrap transition-colors ${
                  active
                    ? "text-[var(--ink)]"
                    : "text-[var(--ink-muted)] hover:text-[var(--ink)]"
                }`}
              >
                {t.label}
                {active && <span className="absolute inset-x-0 -bottom-0.5 h-px bg-[var(--neon)]" aria-hidden />}
              </button>
            );
          })}
        </div>
      </div>


      {tab === "summary" && (
        <>
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
          {hasStats && (
            <AnalysisSection kicker={<><Activity className="h-3 w-3" /> Key stats</>} meta={phase === "finished" ? "Final" : "Live"}>
              <KeyStatsGrid home={stats.home} away={stats.away} homeName={home} awayName={away} />
            </AnalysisSection>
          )}
          {hasEvents && (
            <AnalysisSection kicker={<><Activity className="h-3 w-3" /> Latest events</>} meta={`${Math.min(7, events.length)} of ${events.length}`}>
              <EventTimeline events={events.slice(-7)} home={home} away={away} compact />
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
      )}

      {tab === "stats" && hasStats && (
        <AnalysisSection kicker={<><Activity className="h-3 w-3" /> Full stats</>} meta={phase === "finished" ? "Final" : "Live"}>
          <StatsCompare home={stats.home} away={stats.away} homeName={home} awayName={away} />
        </AnalysisSection>
      )}

      {tab === "lineups" && (
        <>
          {hasLineups ? (
            <AnalysisSection kicker={<><Users className="h-3 w-3" /> Lineups</>} meta="Confirmed XI">
              <div className="space-y-5">
                {(lineups.home?.formation || lineups.away?.formation) && (
                  <FormationPitch home={lineups.home} away={lineups.away} />
                )}
                <LineupSplit lineup={lineups.home} side="home" teamName={home} />
                <LineupSplit lineup={lineups.away} side="away" teamName={away} />
              </div>
            </AnalysisSection>
          ) : (
            <AnalysisSection kicker={<><Users className="h-3 w-3" /> Lineups</>} meta="Pending">
              <p className="text-sm text-[var(--color-ink-muted)]">
                {phase === "lineups"
                  ? "Confirmed lineups drop in the next hour — check back shortly."
                  : "Lineups are released roughly 1 hour before kickoff."}
              </p>
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
          {hasRatings && (
            <AnalysisSection kicker={<><Star className="h-3 w-3" /> Player ratings</>}>
              <div className="grid gap-5 md:grid-cols-2">
                <RatingsTable rows={ratings.home} title={home} />
                <RatingsTable rows={ratings.away} title={away} />
              </div>
            </AnalysisSection>
          )}
        </>
      )}

      {tab === "events" && hasEvents && (
        <AnalysisSection kicker={<><Activity className="h-3 w-3" /> Match events</>} meta={`${Math.min(7, events.length)} latest`}>
          <EventTimeline events={events.slice(-7)} home={home} away={away} />
        </AnalysisSection>
      )}

      {tab === "h2h" && hasH2H && (
        <AnalysisSection kicker={<><History className="h-3 w-3" /> Head to head</>} meta={`Last ${h2h.length}`}>
          <H2HList rows={h2h} />
        </AnalysisSection>
      )}
    </>
  );
}

function AnalysisSection({ kicker, meta, children }: { kicker?: ReactNode; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="relative -mx-4 border-y border-[var(--color-surface-border)]/70 bg-[var(--color-surface-2)]/35 px-4 py-4 md:mx-0 md:border md:bg-[var(--color-surface-2)] md:px-5 md:py-5">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        {kicker && (
          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-neon)]">
            {kicker}
          </span>
        )}
        {meta && (
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">
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
}: {
  match: NonNullable<AnalyticsBundle["match"]>;
  phaseLabel: string;
  phase: AnalyticsBundle["phase"];
  homeGoals: any[];
  awayGoals: any[];
}) {
  const kickoff = new Date(match.kickoff_at);
  const dateStr = kickoff.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
  const stage = match.stage ? match.stage.replace(/_/g, " ") : (match.group_name ?? "Round of 32");
  const isFinished = match.status === "finished";
  const isLive = phase === "live";
  const showScore = isFinished || match.home_score != null || isLive;

  const markers = useMemo(() => {
    return (([] as any[])).concat(
      homeGoals.map((g) => ({ side: "home", kind: "goal", min: g.minute, extra: g.extra_minute, detail: g.detail })),
      awayGoals.map((g) => ({ side: "away", kind: "goal", min: g.minute, extra: g.extra_minute, detail: g.detail })),
    );
  }, [homeGoals, awayGoals]);

  const currentMinute = (() => {
    if (isFinished) {
      const lastEvt = Math.max(0, ...markers.map((m) => (m.min ?? 0) + (m.extra ?? 0)));
      return Math.max(90, lastEvt);
    }
    if (!isLive) return 0;
    const min = Math.max(0, Math.floor((Date.now() - kickoff.getTime()) / 60000));
    if (min <= 45) return min;
    if (min < 60) return 45;
    const second = min - 15;
    if (second <= 105) return second;
    return Math.min(120, second - 5);
  })();

  const progressCap = currentMinute > 90 ? 120 : 90;
  const progressPct = Math.min(100, (currentMinute / progressCap) * 100);

  return (
    <article className="relative py-6">
      {/* Editorial metadata line */}
      <div className="mb-8 flex items-baseline justify-between text-[11px] font-medium uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        <span>{stage}</span>
        <span className="flex items-center gap-2">
          {isLive ? (
            <span className="flex items-center gap-1.5 text-destructive">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive" />
              </span>
              <span className="tracking-[0.28em]">Live {liveClock.label}</span>
            </span>
          ) : (
            <span>{phaseLabel}</span>
          )}
          <span className="text-[var(--ink-faint)]">·</span>
          <span>{dateStr} · {timeStr}</span>
        </span>
      </div>

      {/* Editorial hero — teams and score dominate through pure typography */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 md:gap-8">
        <HeroTeam name={match.home_team} align="right" goals={homeGoals} />
        <div className="flex flex-col items-center gap-3">
          {showScore ? (
            <div className="flex items-baseline gap-3 font-display leading-none tracking-tight md:gap-5">
              <span className="text-6xl font-medium tabular-nums text-[var(--ink)] md:text-7xl">
                {match.home_score ?? 0}
              </span>
              <span className="text-3xl font-light text-[var(--ink-faint)] md:text-4xl">–</span>
              <span className="text-6xl font-medium tabular-nums text-[var(--ink)] md:text-7xl">
                {match.away_score ?? 0}
              </span>
            </div>
          ) : (
            <span className="font-display text-4xl font-light italic tracking-tight text-[var(--ink-faint)] md:text-5xl">
              v
            </span>
          )}
          {(match.penalty_home_score != null || match.penalty_away_score != null) && (
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--neon)]">
              PEN {match.penalty_home_score ?? 0} – {match.penalty_away_score ?? 0}
            </span>
          )}
          {countdown && !isLive && !isFinished && (
            <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-[var(--ink-muted)]">
              Kicks off in {countdown}
            </span>
          )}
        </div>
        <HeroTeam name={match.away_team} align="left" goals={awayGoals} />
      </div>

      {(isLive || isFinished) && (
        <div className="mt-10">
          <MatchProgress pct={progressPct} cap={progressCap} markers={markers} />
        </div>
      )}
    </article>
  );
}


/* Editorial hero team — flag + name, quiet goal list. */
function HeroTeam({ name, align, goals }: { name: string; align: "left"|"right"; goals: any[] }) {
  const url = teamFlagUrl(name, 160);
  const isRight = align === "right";
  const itemsAlign = isRight ? "items-end text-right" : "items-start text-left";
  return (
    <div className={`flex min-w-0 flex-col gap-3 ${itemsAlign}`}>
      <div className="h-11 w-16 shrink-0 overflow-hidden md:h-14 md:w-20">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center bg-[var(--surface-3)] font-display text-[10px] font-medium uppercase tracking-wider text-[var(--ink-muted)]">
            {name.slice(0, 3)}
          </div>
        )}
      </div>
      <span
        className="w-full truncate font-display text-[15px] font-medium leading-tight tracking-tight md:text-lg"
        title={name}
      >
        {name}
      </span>
      {goals.length > 0 && (
        <ul className={`flex w-full flex-col gap-1 text-[12px] leading-tight text-[var(--ink-2)] ${isRight ? "items-end" : "items-start"}`}>
          {goals.map((g, i) => {
            const min = `${g.minute ?? ""}${g.extra_minute ? `+${g.extra_minute}` : ""}'`;
            const isPen = String(g.detail || "").toLowerCase().includes("penalty");
            const isOG = String(g.detail || "").toLowerCase().includes("own");
            const last = (g.player_name || "").split(" ").slice(-1)[0];
            return (
              <li key={i} className={`flex max-w-full items-baseline gap-1.5 ${isRight ? "flex-row-reverse" : ""}`}>
                <span className="truncate font-medium">{last}</span>
                <span className="shrink-0 font-display tabular-nums text-[var(--ink-faint)]">{min}</span>
                {isPen && <span className="shrink-0 text-[var(--ink-faint)]">(P)</span>}
                {isOG && <span className="shrink-0 text-[var(--ink-faint)]">(OG)</span>}
              </li>
            );
          })}
        </ul>
      )}
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

/* Overlaid momentum curves — derives per-side "pressure" from event timeline.
 * Each event contributes a Gaussian-decayed weight to nearby minutes.
 * Home renders as neon area; away as white area; both share the same baseline. */
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
  const W = 600;
  const H = 140;
  const PAD_L = 4;
  const PAD_R = 4;
  const PAD_T = 8;
  const PAD_B = 18;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const CAP = 95;
  const SIGMA = 4.5; // minute spread per event

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

  const toPath = (series: number[], closed = true) => {
    const xs = (i: number) => PAD_L + (i / CAP) * innerW;
    const ys = (v: number) => PAD_T + innerH - (v / maxVal) * innerH;
    let d = `M ${xs(0)} ${ys(series[0] ?? 0)}`;
    for (let i = 1; i <= CAP; i++) d += ` L ${xs(i)} ${ys(series[i] ?? 0)}`;
    if (closed) d += ` L ${xs(CAP)} ${PAD_T + innerH} L ${xs(0)} ${PAD_T + innerH} Z`;
    return d;
  };

  const liveX = PAD_L + (liveMinute / CAP) * innerW;
  const htX = PAD_L + (45 / CAP) * innerW;
  const hasAny = homeSeries.some((v) => v > 0) || awaySeries.some((v) => v > 0);

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.24em]">
        <span className="flex items-center gap-1.5 text-[var(--color-neon)]">
          <span className="h-1.5 w-3 bg-[var(--color-neon)]" /> {homeName}
        </span>
        <span className="text-[var(--color-ink-muted)]">Pressure index</span>
        <span className="flex items-center gap-1.5">
          {awayName} <span className="h-1.5 w-3 bg-white/70" />
        </span>
      </div>

      {hasAny ? (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="mg-home" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--color-neon)" stopOpacity="0.7" />
              <stop offset="100%" stopColor="var(--color-neon)" stopOpacity="0.05" />
            </linearGradient>
            <linearGradient id="mg-away" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {/* grid */}
          {[0.25, 0.5, 0.75].map((g) => (
            <line key={g} x1={PAD_L} x2={W - PAD_R} y1={PAD_T + innerH * g} y2={PAD_T + innerH * g}
              stroke="var(--color-surface-border)" strokeDasharray="2 3" strokeWidth="0.5" />
          ))}

          {/* HT marker */}
          <line x1={htX} x2={htX} y1={PAD_T} y2={PAD_T + innerH}
            stroke="var(--color-surface-border)" strokeDasharray="2 2" strokeWidth="0.6" />
          <text x={htX} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">HT</text>

          {/* areas */}
          <path d={toPath(awaySeries)} fill="url(#mg-away)" stroke="rgba(255,255,255,0.85)" strokeWidth="1" />
          <path d={toPath(homeSeries)} fill="url(#mg-home)" stroke="var(--color-neon)" strokeWidth="1.2" />

          {/* event ticks */}
          {events.map((e: any, i: number) => {
            const t = String(e?.type ?? "").toLowerCase();
            if (t !== "goal") return null;
            const min = Math.min(CAP, Math.max(0, (e.minute ?? 0) + (e.extra_minute ?? 0)));
            const x = PAD_L + (min / CAP) * innerW;
            const isHome = e.side === "home";
            return (
              <circle key={i} cx={x} cy={isHome ? PAD_T + 2 : PAD_T + innerH - 2}
                r="2" fill={isHome ? "var(--color-neon)" : "#ffffff"} />
            );
          })}

          {/* live cursor */}
          {phase === "live" && liveMinute > 0 && (
            <>
              <line x1={liveX} x2={liveX} y1={PAD_T} y2={PAD_T + innerH}
                stroke="hsl(var(--destructive))" strokeWidth="1" />
              <circle cx={liveX} cy={PAD_T} r="2.5" fill="hsl(var(--destructive))" />
            </>
          )}

          {/* axis labels */}
          <text x={PAD_L} y={H - 4} fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">0'</text>
          <text x={W - PAD_R} y={H - 4} textAnchor="end" fontSize="8" fill="var(--color-ink-muted)" fontWeight="700">90'</text>
        </svg>
      ) : (
        <p className="py-6 text-center text-xs text-[var(--color-ink-muted)]">Momentum builds once events roll in.</p>
      )}
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


/* ---------- Lineups ---------- */

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
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between border-b border-dashed border-[var(--color-surface-border)] pb-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{teamName}</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          {lineup.formation ?? ""}
        </span>
      </div>
      <ul className="grid gap-y-1.5 text-sm sm:grid-cols-2 sm:gap-x-3 md:grid-cols-3">
        {starters.map((p, i) => (
          <li key={`s-${i}`} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-baseline gap-2">
            <span className="text-right font-display text-xs font-bold tabular-nums text-[var(--color-neon)]">
              {p.number ?? ""}
            </span>
            <span className="truncate">{p.name}</span>
            {p.pos && <span className="ml-auto text-[10px] uppercase text-[var(--color-ink-muted)]">{p.pos}</span>}
          </li>
        ))}
      </ul>
      {subs.length > 0 && (
        <>
          <div className="mt-3 text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-ink-muted)]">
            Bench
          </div>
          <ul className="mt-2 grid gap-y-1.5 text-sm sm:grid-cols-2 sm:gap-x-3 md:grid-cols-3">
            {subs.map((p, i) => (
              <li key={`b-${i}`} className="grid grid-cols-[28px_minmax(0,1fr)] items-baseline gap-2 text-[var(--color-ink-muted)]">
                <span className="text-right font-display text-xs font-bold tabular-nums">{p.number ?? ""}</span>
                <span className="truncate">{p.name}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {lineup.coach_name && (
        <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          Coach: <span className="text-[var(--color-ink)]">{lineup.coach_name}</span>
        </div>
      )}
    </div>
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

function StatsCompare({ home, away, homeName, awayName }: { home: any; away: any; homeName: string; awayName: string }) {
  const rows: Array<{ key: string; label: string }> = [
    { key: "possession", label: "Possession %" },
    { key: "shots_total", label: "Shots" },
    { key: "shots_on", label: "On target" },
    { key: "corners", label: "Corners" },
    { key: "fouls", label: "Fouls" },
    { key: "yellow_cards", label: "Yellow" },
    { key: "red_cards", label: "Red" },
    { key: "saves", label: "Saves" },
    { key: "passes_accurate", label: "Pass accurate" },
    { key: "passes_pct", label: "Pass %" },
    { key: "xg", label: "xG" },
  ];
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 text-[10px] font-black uppercase tracking-[0.18em]">
        <span className="min-w-0 truncate text-left text-[var(--color-neon)]">{homeName}</span>
        <span className="shrink-0 text-center text-[var(--color-ink-muted)]">stat</span>
        <span className="min-w-0 truncate text-right">{awayName}</span>
      </div>
      {rows.map((r) => {
        const h = home?.[r.key];
        const a = away?.[r.key];
        if (h == null && a == null) return null;
        const hv = Number(h ?? 0);
        const av = Number(a ?? 0);
        const total = hv + av || 1;
        const hPct = (hv / total) * 100;
        const aPct = (av / total) * 100;
        const homeLeads = hv > av;
        return (
          <div key={r.key} className="border-b border-dashed border-[var(--color-surface-border)]/55 pb-3 last:border-0 last:pb-0">
            <div className="mb-2 grid grid-cols-[64px_1fr_64px] items-baseline gap-2">
              <span className={`text-left font-display text-xl font-black tabular-nums ${homeLeads ? "text-[var(--color-neon)]" : "text-[var(--color-ink)]"}`}>{h ?? "—"}</span>
              <span className="text-center text-[10px] font-black uppercase tracking-[0.18em] text-[var(--color-ink-muted)]">{r.label}</span>
              <span className={`text-right font-display text-xl font-black tabular-nums ${!homeLeads && av > 0 ? "text-[var(--color-ink)]" : "text-[var(--color-ink)]/80"}`}>{a ?? "—"}</span>
            </div>
            {/* Mirror bars meeting in the centre */}
            <div className="grid grid-cols-2 items-center">
              <div className="flex h-2.5 justify-end bg-[var(--color-surface)]">
                <div
                  className="h-full bg-[var(--color-neon)] shadow-[0_0_8px_var(--color-neon-glow)] transition-all duration-700"
                  style={{ width: `${hPct}%` }}
                />
              </div>
              <div className="flex h-2.5 bg-[var(--color-surface)]">
                <div
                  className="h-full bg-white/70 transition-all duration-700"
                  style={{ width: `${aPct}%` }}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Event timeline ---------- */

function EventTimeline({ events, home, away, compact }: { events: any[]; home: string; away: string; compact?: boolean }) {
  // Newest first
  const ordered = [...events].sort((a, b) => {
    const am = (a.minute ?? 0) + (a.extra_minute ?? 0);
    const bm = (b.minute ?? 0) + (b.extra_minute ?? 0);
    return bm - am;
  });
  const hasMore = !compact && ordered.length > 7;
  return (
    <div className="relative">
      <div className={compact ? "" : "md:max-h-[420px] md:overflow-y-auto md:pr-1"}>

        <ul className="relative space-y-3">
          {/* Vertical timeline rail */}
          <span aria-hidden className="pointer-events-none absolute bottom-2 left-[48px] top-2 w-px bg-[var(--color-surface-border)]" />
          {ordered.map((e) => {
            const sideLabel = e.side === "home" ? home : e.side === "away" ? away : "";
            const isHome = e.side === "home";
            return (
              <li key={e.id} className="relative grid grid-cols-[40px_28px_minmax(0,1fr)] items-center gap-2.5 text-sm">
                <span className="font-display text-xs font-black tabular-nums text-[var(--color-ink-muted)]">
                  {e.minute ?? "—"}{e.extra_minute ? `+${e.extra_minute}` : ""}'
                </span>
                <span className="relative z-10 grid h-7 w-7 place-items-center border border-[var(--color-surface-border)] bg-[var(--color-surface-2)]">
                  {eventMark(e.type, e.detail, 12)}
                </span>
                <div className="min-w-0 border-l-2 py-1 pl-3 leading-snug" style={{ borderColor: isHome ? "var(--color-neon)" : "rgba(255,255,255,0.5)" }}>
                  <div className="truncate">
                    <span className="font-semibold">{e.player_name ?? e.detail ?? e.type}</span>
                    {e.assist_name && <span className="text-[var(--color-ink-muted)]"> · assist {e.assist_name}</span>}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
                    {e.detail ?? e.type}{sideLabel && ` · ${sideLabel}`}
                  </div>
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
  return (
    <div>
      <div className="mb-2 border-b border-dashed border-[var(--color-surface-border)] pb-1 text-[11px] font-bold uppercase tracking-[0.22em]">{title}</div>
      <ul className="space-y-1 text-xs">
        {rows.slice(0, 14).map((r) => (
          <li key={r.id} className="grid grid-cols-[20px_1fr_auto_auto] items-baseline gap-2">
            <span className="text-right font-display text-[10px] font-bold tabular-nums text-[var(--color-ink-muted)]">{r.number ?? ""}</span>
            <span className="truncate">{r.player_name}</span>
            <span className="text-[10px] uppercase text-[var(--color-ink-muted)]">{r.position ?? ""}</span>
            <span className={`font-display text-xs font-bold tabular-nums ${ratingTone(r.rating)}`}>
              {r.rating != null ? Number(r.rating).toFixed(1) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function ratingTone(rating: number | null): string {
  if (rating == null) return "text-[var(--color-ink-muted)]";
  const n = Number(rating);
  if (n >= 8) return "text-[var(--color-neon)]";
  if (n >= 7) return "text-[var(--color-ink)]";
  if (n >= 6) return "text-[var(--color-ink-muted)]";
  return "text-destructive";
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
