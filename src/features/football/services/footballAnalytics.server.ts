// Server-only: builds the same AnalyticsBundle shape the World Cup match
// screen consumes, but sourced from `sports_events` (club football) instead
// of the legacy `matches` table.
//
// One API-Football call (`/fixtures?id=`) returns fixture + events + lineups +
// statistics + players, so a full report costs 3 requests (fixture, injuries,
// h2h). Results are cached in `football_event_analytics` so repeated views and
// 30s live polling do not burn quota.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiFootballGet } from "@/lib/apifootball.server";
import type { AnalyticsBundle } from "@/lib/match-analytics.functions";

const LIVE_TTL_MS = 60_000;
const PRE_TTL_MS = 10 * 60_000;
const FINISHED_TTL_MS = 6 * 60 * 60_000;

function emptyBundle(): AnalyticsBundle {
  return {
    match: null,
    phase: "pre",
    lineups: { home: null, away: null },
    events: [],
    stats: { home: null, away: null },
    ratings: { home: [], away: [] },
    h2h: [],
    injuries: { home: [], away: [] },
    teamForm: { home: null, away: null },
  };
}

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function toInt(v: any): number | null {
  if (v == null) return null;
  const n = parseInt(String(v).replace("%", ""), 10);
  return Number.isFinite(n) ? n : null;
}
function toNum(v: any): number | null {
  if (v == null) return null;
  const n = Number(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : null;
}
function pickStat(list: any[], type: string): any {
  return (list ?? []).find(
    (s: any) => String(s?.type ?? "").toLowerCase() === type.toLowerCase(),
  )?.value;
}

function mapStats(block: any) {
  const s = block?.statistics ?? [];
  return {
    possession: toInt(pickStat(s, "Ball Possession")),
    shots_total: toInt(pickStat(s, "Total Shots")),
    shots_on: toInt(pickStat(s, "Shots on Goal")),
    shots_off: toInt(pickStat(s, "Shots off Goal")),
    shots_blocked: toInt(pickStat(s, "Blocked Shots")),
    shots_inside: toInt(pickStat(s, "Shots insidebox")),
    shots_outside: toInt(pickStat(s, "Shots outsidebox")),
    corners: toInt(pickStat(s, "Corner Kicks")),
    offsides: toInt(pickStat(s, "Offsides")),
    fouls: toInt(pickStat(s, "Fouls")),
    yellow_cards: toInt(pickStat(s, "Yellow Cards")),
    red_cards: toInt(pickStat(s, "Red Cards")),
    saves: toInt(pickStat(s, "Goalkeeper Saves")),
    passes_total: toInt(pickStat(s, "Total passes")),
    passes_accurate: toInt(pickStat(s, "Passes accurate")),
    passes_pct: toInt(pickStat(s, "Passes %")),
    xg: toNum(pickStat(s, "expected_goals")),
  };
}

function mapLineup(block: any) {
  return {
    formation: block?.formation ?? null,
    coach_name: block?.coach?.name ?? null,
    team_name: block?.team?.name ?? null,
    team_logo: block?.team?.logo ?? null,
    starters: (block?.startXI ?? []).map((p: any) => ({
      id: p?.player?.id ?? null,
      name: p?.player?.name ?? "",
      number: p?.player?.number ?? null,
      pos: p?.player?.pos ?? null,
      grid: p?.player?.grid ?? null,
    })),
    substitutes: (block?.substitutes ?? []).map((p: any) => ({
      id: p?.player?.id ?? null,
      name: p?.player?.name ?? "",
      number: p?.player?.number ?? null,
      pos: p?.player?.pos ?? null,
      grid: null,
    })),
  };
}

async function resolveFixtureId(ev: any): Promise<number | null> {
  const { data: mapping } = await (supabaseAdmin as any)
    .from("sports_event_provider_mappings")
    .select("provider_event_id")
    .eq("sports_event_id", ev.id)
    .eq("provider", "api-football")
    .maybeSingle();
  const fid = Number(mapping?.provider_event_id);
  if (Number.isFinite(fid) && fid > 0) return fid;
  const meta = ev.source_metadata ?? {};
  const alt = Number(meta.fixture_id ?? meta.apifootball_fixture_id);
  return Number.isFinite(alt) && alt > 0 ? alt : null;
}

export async function fetchFootballEventAnalytics(
  eventId: string,
): Promise<AnalyticsBundle> {
  const { data: ev } = await (supabaseAdmin as any)
    .from("sports_events")
    .select(
      "id, home_name, away_name, home_logo, away_logo, scheduled_at, status, round, competition_code, venue, home_score, away_score, ht_home_score, ht_away_score, live_minute, source_metadata",
    )
    .eq("id", eventId)
    .maybeSingle();
  if (!ev) return emptyBundle();

  const now = Date.now();
  const kickoff = new Date(ev.scheduled_at).getTime();
  let phase: AnalyticsBundle["phase"] = "pre";
  if (["finished", "cancelled", "postponed", "abandoned"].includes(ev.status)) phase = "finished";
  else if (ev.status === "live" || ev.status === "halftime" || now >= kickoff) phase = "live";
  else if (kickoff - now <= 90 * 60 * 1000) phase = "lineups";

  const base = {
    id: ev.id as string,
    home_team: ev.home_name as string,
    away_team: ev.away_name as string,
    kickoff_at: ev.scheduled_at as string,
    status: ev.status as string,
    stage: (ev.round as string) ?? null,
    group_name: null,
    home_score: ev.home_score ?? null,
    away_score: ev.away_score ?? null,
    ft_home_score: null,
    ft_away_score: null,
    penalty_home_score: null,
    penalty_away_score: null,
    venue: (ev.venue as string) ?? null,
    referee: null,
    apifootball_fixture_id: null as number | null,
    // Extras consumed by the shared hero (club crests instead of flags).
    home_logo: ev.home_logo ?? null,
    away_logo: ev.away_logo ?? null,
    live_elapsed: ev.live_minute ?? null,
  };

  const ttl = phase === "live" ? LIVE_TTL_MS : phase === "finished" ? FINISHED_TTL_MS : PRE_TTL_MS;
  const { data: cached } = await (supabaseAdmin as any)
    .from("football_event_analytics")
    .select("payload, fetched_at")
    .eq("sports_event_id", eventId)
    .maybeSingle();

  if (cached?.payload) {
    const p = cached.payload as any;
    const fresh = now - new Date(cached.fetched_at).getTime() < ttl;
    // A bundle cached in an earlier phase (e.g. pre-match) holds no events,
    // stats or lineups — never serve it once the match is live/finished.
    const samePhase = p.phase === phase;
    const hasReport =
      (p.events?.length ?? 0) > 0 || !!p.stats?.home || !!p.stats?.away || !!p.lineups?.home;
    const usable = fresh && samePhase && (phase === "pre" || hasReport);
    if (usable) {
      return { ...(p as AnalyticsBundle), phase, match: { ...base, ...p.matchExtras } };
    }
  }


  const fixtureId = await resolveFixtureId(ev);
  if (!fixtureId) {
    const fallback = { ...emptyBundle(), match: base as any, phase };
    return fallback;
  }
  base.apifootball_fixture_id = fixtureId;

  const [fxRes, injRes] = await Promise.all([
    apiFootballGet<any[]>(`/fixtures?id=${fixtureId}`),
    apiFootballGet<any[]>(`/injuries?fixture=${fixtureId}`),
  ]);

  if ("skipped" in fxRes) {
    // Quota guard tripped — serve whatever we cached previously.
    if (cached?.payload) {
      return { ...(cached.payload as AnalyticsBundle), match: base as any, phase };
    }
    return { ...emptyBundle(), match: base as any, phase };
  }

  const fx = fxRes.data?.[0];
  const homeKey = norm(ev.home_name);
  const awayKey = norm(ev.away_name);
  const sideOf = (name: string): "home" | "away" | null => {
    const n = norm(name);
    if (n === homeKey) return "home";
    if (n === awayKey) return "away";
    return null;
  };

  // Score / venue / referee straight off the fixture payload.
  if (fx) {
    base.venue = fx?.fixture?.venue?.name ?? base.venue;
    base.referee = fx?.fixture?.referee ?? null;
    base.home_score = fx?.score?.fulltime?.home ?? fx?.goals?.home ?? base.home_score;
    base.away_score = fx?.score?.fulltime?.away ?? fx?.goals?.away ?? base.away_score;
    base.ft_home_score = fx?.score?.extratime?.home ?? fx?.goals?.home ?? null;
    base.ft_away_score = fx?.score?.extratime?.away ?? fx?.goals?.away ?? null;
    base.penalty_home_score = fx?.score?.penalty?.home ?? null;
    base.penalty_away_score = fx?.score?.penalty?.away ?? null;
  }

  const lineupBlocks = fx?.lineups ?? [];
  const lineups = {
    home: lineupBlocks.map(mapLineup).find((_: any, i: number) => sideOf(lineupBlocks[i]?.team?.name ?? "") === "home") ?? null,
    away: lineupBlocks.map(mapLineup).find((_: any, i: number) => sideOf(lineupBlocks[i]?.team?.name ?? "") === "away") ?? null,
  };

  const events = (fx?.events ?? []).map((e: any, i: number) => ({
    id: `${fixtureId}-${i}`,
    minute: e?.time?.elapsed ?? null,
    extra_minute: e?.time?.extra ?? null,
    side: sideOf(e?.team?.name ?? ""),
    type: String(e?.type ?? "event"),
    detail: e?.detail ?? null,
    player_name: e?.player?.name ?? null,
    assist_name: e?.assist?.name ?? null,
    comments: e?.comments ?? null,
  }));

  const statBlocks = fx?.statistics ?? [];
  const stats = {
    home: statBlocks.find((b: any) => sideOf(b?.team?.name ?? "") === "home")
      ? mapStats(statBlocks.find((b: any) => sideOf(b?.team?.name ?? "") === "home"))
      : null,
    away: statBlocks.find((b: any) => sideOf(b?.team?.name ?? "") === "away")
      ? mapStats(statBlocks.find((b: any) => sideOf(b?.team?.name ?? "") === "away"))
      : null,
  };

  const ratings: { home: any[]; away: any[] } = { home: [], away: [] };
  for (const block of fx?.players ?? []) {
    const side = sideOf(block?.team?.name ?? "");
    if (!side) continue;
    for (const p of block?.players ?? []) {
      const st = (p?.statistics ?? [])[0] ?? {};
      ratings[side].push({
        id: `${fixtureId}-${p?.player?.id ?? Math.random()}`,
        player_name: p?.player?.name ?? "",
        number: st?.games?.number ?? null,
        position: st?.games?.position ?? null,
        rating: st?.games?.rating != null ? Number(st.games.rating) : null,
        minutes: st?.games?.minutes ?? null,
        goals: st?.goals?.total ?? null,
        assists: st?.goals?.assists ?? null,
      });
    }
  }

  const injuries: { home: any[]; away: any[] } = { home: [], away: [] };
  if (!("skipped" in injRes)) {
    for (const it of injRes.data ?? []) {
      const side = sideOf(it?.team?.name ?? "");
      if (!side) continue;
      injuries[side].push({
        id: `${fixtureId}-inj-${it?.player?.id ?? injuries[side].length}`,
        player_name: it?.player?.name ?? "",
        type: it?.player?.type ?? null,
        reason: it?.player?.reason ?? null,
      });
    }
  }

  let h2h: any[] = [];
  const homeId = fx?.teams?.home?.id;
  const awayId = fx?.teams?.away?.id;
  if (homeId && awayId) {
    const h2hRes = await apiFootballGet<any[]>(
      `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=8`,
    );
    if (!("skipped" in h2hRes)) {
      h2h = (h2hRes.data ?? []).map((f: any) => ({
        date: f?.fixture?.date ?? null,
        home: f?.teams?.home?.name ?? "",
        away: f?.teams?.away?.name ?? "",
        home_goals: f?.goals?.home ?? null,
        away_goals: f?.goals?.away ?? null,
      }));
    }
  }

  const bundle: AnalyticsBundle = {
    match: base as any,
    phase,
    lineups,
    events,
    stats,
    ratings,
    h2h,
    injuries,
    teamForm: { home: null, away: null },
  };

  await (supabaseAdmin as any).from("football_event_analytics").upsert(
    {
      sports_event_id: eventId,
      payload: {
        ...bundle,
        match: null,
        matchExtras: {
          venue: base.venue,
          referee: base.referee,
          apifootball_fixture_id: fixtureId,
          home_score: base.home_score,
          away_score: base.away_score,
          ft_home_score: base.ft_home_score,
          ft_away_score: base.ft_away_score,
          penalty_home_score: base.penalty_home_score,
          penalty_away_score: base.penalty_away_score,
        },
      },
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "sports_event_id" },
  );

  return bundle;
}
