import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Activity, Users, AlertTriangle, History, Star } from "lucide-react";
import { teamFlagUrl } from "@/lib/country-flags";
import { getMatchAnalytics, type AnalyticsBundle, type LineupPlayer } from "@/lib/match-analytics.functions";
import { MarketTabs } from "@/components/matches/MarketTabs";
import { Corner, StencilPanel } from "@/components/ui/page-shell";
import { CsseLogo, BrandText } from "@/components/brand/CsseMark";
import { eventMark, WhistleIcon, PitchIcon, GoalIcon, YellowCardIcon, RedCardIcon } from "@/components/matches/MatchIcons";
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
    <div className="min-h-screen bg-[var(--color-surface)] text-[var(--color-ink)]">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, var(--color-neon) 0 1px, transparent 1px 3px)",
        }}
      />
      <div className="relative mx-auto flex max-w-md flex-col gap-5 px-4 py-5 md:max-w-3xl md:py-8">
        <header className="flex items-center justify-between">
          <Link
            to="/matches"
            className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-ink-muted)] transition-colors hover:text-[var(--color-neon)]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Matches
          </Link>
          <Link to="/dashboard"><CsseLogo size={22} /></Link>
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

  // Derive goal scorers per side from events
  const goals = events.filter((e: any) => String(e.type).toLowerCase() === "goal");
  const homeGoals = goals.filter((e: any) => e.side === "home");
  const awayGoals = goals.filter((e: any) => e.side === "away");

  return (
    <>
      <MatchHero
        match={match}
        phaseLabel={phaseLabel}
        phase={phase}
        homeGoals={homeGoals}
        awayGoals={awayGoals}
        stats={stats}
      />

      {/* Markets — only show pre-kickoff */}
      {!locked && (
        <StencilPanel kicker={<><Activity className="h-3 w-3" /> Markets</>}>
          <MarketTabs matchId={match.id} locked={false} bettingBlocked={false} suspendedMarkets={[]} />
        </StencilPanel>
      )}
      {locked && (
        <BettingRibbon phase={phase} />
      )}

      {/* Momentum strip — quick visual when live */}
      {phase === "live" && hasStats && (
        <MomentumStrip stats={stats} homeName={home} awayName={away} />
      )}

      {/* Live event timeline */}
      {hasEvents && (
        <StencilPanel
          kicker={<><Activity className="h-3 w-3" /> Match events</>}
          meta={`${events.length} entries`}
        >
          <EventTimeline events={events} home={home} away={away} />
        </StencilPanel>
      )}

      {/* Live / FT stats */}
      {hasStats && (
        <StencilPanel kicker={<><Activity className="h-3 w-3" /> Match stats</>} meta={phase === "finished" ? "Final" : "Live"}>
          <StatsCompare home={stats.home} away={stats.away} homeName={home} awayName={away} />
        </StencilPanel>
      )}

      {/* Lineups */}
      {hasLineups ? (
        <StencilPanel kicker={<><Users className="h-3 w-3" /> Lineups</>} meta="Confirmed XI">
          <div className="space-y-5">
            {(lineups.home?.formation || lineups.away?.formation) && (
              <FormationPitch home={lineups.home} away={lineups.away} />
            )}
            <LineupSplit lineup={lineups.home} side="home" teamName={home} />
            <LineupSplit lineup={lineups.away} side="away" teamName={away} />
          </div>
        </StencilPanel>
      ) : (phase === "pre" || phase === "lineups") && (
        <StencilPanel kicker={<><Users className="h-3 w-3" /> Lineups</>} meta="Pending">
          <p className="text-sm text-[var(--color-ink-muted)]">
            {phase === "lineups"
              ? "Confirmed lineups drop in the next hour — check back shortly."
              : "Lineups are released roughly 1 hour before kickoff."}
          </p>
        </StencilPanel>
      )}

      {/* Injuries / absences */}
      {hasInjuries && (
        <StencilPanel kicker={<><AlertTriangle className="h-3 w-3" /> Injury report</>}>
          <div className="grid gap-4 md:grid-cols-2">
            <InjuryList items={injuries.home} title={home} />
            <InjuryList items={injuries.away} title={away} />
          </div>
        </StencilPanel>
      )}

      {/* Player ratings — post-match */}
      {hasRatings && (
        <StencilPanel kicker={<><Star className="h-3 w-3" /> Player ratings</>}>
          <div className="grid gap-5 md:grid-cols-2">
            <RatingsTable rows={ratings.home} title={home} />
            <RatingsTable rows={ratings.away} title={away} />
          </div>
        </StencilPanel>
      )}

      {/* Head to head */}
      {hasH2H && (
        <StencilPanel kicker={<><History className="h-3 w-3" /> Head to head</>} meta={`Last ${h2h.length}`}>
          <H2HList rows={h2h} />
        </StencilPanel>
      )}

      {!hasLineups && !hasStats && !hasEvents && !hasInjuries && !hasH2H && phase === "pre" && (
        <StencilPanel>
          <p className="text-sm text-[var(--color-ink-muted)]">
            Analytics data warms up as kickoff nears. Head-to-head and injury reports populate first, then lineups,
            then live stats once the whistle goes.
          </p>
        </StencilPanel>
      )}
    </>
  );
}

function useLiveMinute(kickoffISO: string, status: string, events: any[] = []) {
  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    if (status === "finished") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);
  if (status === "finished") return { label: "FT", isLive: false };
  const kickoff = new Date(kickoffISO).getTime();
  const diffMin = Math.floor((now - kickoff) / 60000);
  if (diffMin < 0) return { label: "", isLive: false };
  // Heuristic clock with HT break (45..60 -> HT). Cap at 90 + injury inferred from events.
  if (diffMin <= 45) return { label: `${diffMin}'`, isLive: true };
  if (diffMin < 60) return { label: "HT", isLive: true };
  const second = diffMin - 15; // subtract 15 min HT
  if (second <= 90) return { label: `${second}'`, isLive: true };
  return { label: "90'+", isLive: true };
}

function MatchHero({
  match,
  phaseLabel,
  phase,
  homeGoals,
  awayGoals,
  stats,
}: {
  match: NonNullable<AnalyticsBundle["match"]>;
  phaseLabel: string;
  phase: AnalyticsBundle["phase"];
  homeGoals: any[];
  awayGoals: any[];
  stats: AnalyticsBundle["stats"];
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

  const liveClock = useLiveMinute(match.kickoff_at, match.status);
  const stage = match.stage ? match.stage.replace(/_/g, " ") : (match.group_name ?? "Round of 32");
  const isFinished = match.status === "finished";
  const isLive = phase === "live";
  const showScore = isFinished || match.home_score != null || isLive;

  return (
    <article className="relative overflow-hidden border border-[var(--color-neon)]/25 bg-[var(--color-surface-2)]">
      <Corner pos="tl" /><Corner pos="tr" /><Corner pos="bl" /><Corner pos="br" />
      <div className="flex items-center justify-between border-b border-dashed border-[var(--color-surface-border)] px-5 py-3">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
          <Radio className="h-3 w-3" /> {stage}
        </span>
        <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
          {isLive && (
            <span className="flex items-center gap-1 text-destructive">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-destructive" />
              </span>
              <span className="font-bold tracking-[0.28em]">LIVE {liveClock.label}</span>
            </span>
          )}
          {!isLive && <span>{phaseLabel}</span>}
        </span>
      </div>
      <div className="px-5 py-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
          <TeamBlock name={match.home_team} goals={homeGoals} />
          <div className="flex flex-col items-center gap-1 pt-2">
            {showScore ? (
              <span className="font-display text-4xl font-bold tabular-nums leading-none">
                {match.home_score ?? 0}<span className="mx-1 text-[var(--color-ink-muted)]">–</span>{match.away_score ?? 0}
              </span>
            ) : (
              <span className="font-display text-3xl font-bold leading-none text-[var(--color-ink-muted)]">vs</span>
            )}
            <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">
              {dateStr} · {timeStr}
            </span>
            {countdown && !isLive && !isFinished && (
              <span className="mt-1 rounded-sm border border-[var(--color-neon)]/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--color-neon)]">
                ⏱ {countdown}
              </span>
            )}
            {isLive && liveClock.label && (
              <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.28em] text-destructive">
                {liveClock.label}
              </span>
            )}
          </div>
          <TeamBlock name={match.away_team} goals={awayGoals} align="right" />
        </div>
        {(isLive || isFinished) && (stats.home || stats.away) && (
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-dashed border-[var(--color-surface-border)] pt-3 text-center">
            <MicroStat label="Shots" h={stats.home?.shots_total} a={stats.away?.shots_total} />
            <MicroStat label="On Tgt" h={stats.home?.shots_on} a={stats.away?.shots_on} />
            <MicroStat label="Poss %" h={stats.home?.possession} a={stats.away?.possession} />
          </div>
        )}
      </div>
    </article>
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

function TeamBlock({ name, goals = [], align = "left" }: { name: string; goals?: any[]; align?: "left" | "right" }) {
  const url = teamFlagUrl(name, 160);
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  // Center on small layout, but allow scorer column to align inward
  return (
    <div className="flex flex-col items-center gap-2">
      {url ? (
        <img src={url} alt={`${name} flag`} className="h-12 w-20 border border-border/40 object-cover shadow-sm" loading="lazy" />
      ) : (
        <div className="grid h-12 w-20 place-items-center border border-border/40 bg-[var(--color-surface)] text-[10px] font-bold uppercase">
          {name.slice(0, 3)}
        </div>
      )}
      <span className="max-w-[120px] truncate text-center text-xs font-bold uppercase tracking-wide">{name}</span>
      {goals.length > 0 && (
        <ul className={`flex w-full flex-col gap-0.5 text-[10px] leading-tight ${align === "right" ? "items-end" : "items-start"}`}>
          {goals.map((g, i) => {
            const min = `${g.minute ?? ""}${g.extra_minute ? `+${g.extra_minute}` : ""}'`;
            const isPen = String(g.detail || "").toLowerCase().includes("penalty");
            const isOG = String(g.detail || "").toLowerCase().includes("own");
            const last = (g.player_name || "").split(" ").slice(-1)[0];
            return (
              <li key={i} className="flex items-baseline gap-1 text-[var(--color-ink)]">
                <span>⚽</span>
                <span className="font-semibold truncate max-w-[100px]">{last}</span>
                <span className="font-display tabular-nums text-[var(--color-neon)]">{min}</span>
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
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-3">
        {starters.map((p, i) => (
          <li key={`s-${i}`} className="flex items-baseline gap-2">
            <span className="w-6 text-right font-display text-[11px] font-bold tabular-nums text-[var(--color-neon)]">
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
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] sm:grid-cols-3">
            {subs.map((p, i) => (
              <li key={`b-${i}`} className="flex items-baseline gap-2 text-[var(--color-ink-muted)]">
                <span className="w-6 text-right font-display text-[11px] font-bold tabular-nums">{p.number ?? ""}</span>
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
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2 text-[10px] font-bold uppercase tracking-[0.22em]">
        <span className="text-left">{homeName}</span>
        <span className="text-center text-[var(--color-ink-muted)]">stat</span>
        <span className="text-right">{awayName}</span>
      </div>
      {rows.map((r) => {
        const h = home?.[r.key];
        const a = away?.[r.key];
        if (h == null && a == null) return null;
        const hv = Number(h ?? 0);
        const av = Number(a ?? 0);
        const total = hv + av || 1;
        const hPct = (hv / total) * 100;
        return (
          <div key={r.key} className="space-y-1">
            <div className="grid grid-cols-3 items-center gap-2 text-xs">
              <span className="text-left font-display font-bold tabular-nums">{h ?? "—"}</span>
              <span className="text-center text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{r.label}</span>
              <span className="text-right font-display font-bold tabular-nums">{a ?? "—"}</span>
            </div>
            <div className="flex h-1 overflow-hidden bg-[var(--color-surface)]">
              <div className="bg-[var(--color-neon)]" style={{ width: `${hPct}%` }} />
              <div className="bg-white/40" style={{ width: `${100 - hPct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Event timeline ---------- */

function EventTimeline({ events, home, away }: { events: any[]; home: string; away: string }) {
  return (
    <ul className="space-y-1.5">
      {events.map((e) => {
        const sideLabel = e.side === "home" ? home : e.side === "away" ? away : "";
        return (
          <li key={e.id} className="grid grid-cols-[40px_24px_1fr] items-baseline gap-2 border-b border-dashed border-[var(--color-surface-border)]/60 pb-1 text-xs last:border-0">
            <span className="font-display text-[11px] font-bold tabular-nums text-[var(--color-neon)]">
              {e.minute ?? "—"}{e.extra_minute ? `+${e.extra_minute}` : ""}'
            </span>
            <span className="text-base leading-none">{eventIcon(e.type, e.detail)}</span>
            <div className="min-w-0">
              <div className="truncate"><span className="font-semibold">{e.player_name ?? e.detail ?? e.type}</span>{e.assist_name && <span className="text-[var(--color-ink-muted)]"> · assist {e.assist_name}</span>}</div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--color-ink-muted)]">{e.detail ?? e.type} {sideLabel && `· ${sideLabel}`}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
function eventIcon(type: string, detail: string | null): string {
  const t = (type || "").toLowerCase();
  const d = (detail || "").toLowerCase();
  if (t === "goal") return d.includes("own") ? "🥅" : d.includes("penalty") ? "🎯" : "⚽";
  if (t === "card") return d.includes("red") ? "🟥" : "🟨";
  if (t === "subst") return "🔁";
  if (t === "var") return "📺";
  return "•";
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
