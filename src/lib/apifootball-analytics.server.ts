// Server-only: API-Football analytics endpoint wrappers.
// All calls funnel through apiFootballGet so the daily quota is enforced.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiFootballGet, WC_LEAGUE_ID, WC_SEASON } from "./apifootball.server";

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  apifootball_fixture_id: number | null;
};

const TEAM_ALIASES: Record<string, string> = {
  czechia: "czechrepublic",
  unitedstates: "usa",
  southkorea: "korearepublic",
  ivorycoast: "cotedivoire",
  capeverde: "caboverde",
  drcongo: "congodr",
  bosnia: "bosniaandherzegovina",
};
function norm(s: string): string {
  const b = (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[b] ?? b;
}

async function loadMatch(matchId: string): Promise<Match | null> {
  const { data } = await (supabaseAdmin as any)
    .from("matches")
    .select("id, home_team, away_team, kickoff_at, status, apifootball_fixture_id")
    .eq("id", matchId)
    .maybeSingle();
  return data ?? null;
}

async function resolveFixtureId(match: Match): Promise<number | null> {
  if (match.apifootball_fixture_id) return match.apifootball_fixture_id;
  const date = match.kickoff_at.slice(0, 10);
  const res = await apiFootballGet<any[]>(
    `/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&date=${date}`,
  );
  if ("skipped" in res) return null;
  const h = norm(match.home_team);
  const a = norm(match.away_team);
  for (const f of res.data ?? []) {
    const fh = norm(f?.teams?.home?.name ?? "");
    const fa = norm(f?.teams?.away?.name ?? "");
    if ((fh === h && fa === a) || (fh === a && fa === h)) {
      const fid = Number(f?.fixture?.id);
      if (fid) {
        await (supabaseAdmin as any)
          .from("matches")
          .update({ apifootball_fixture_id: fid, updated_at: new Date().toISOString() })
          .eq("id", match.id);
        return fid;
      }
    }
  }
  return null;
}

function sideOfTeam(match: Match, teamName: string): "home" | "away" | null {
  const t = norm(teamName);
  if (t === norm(match.home_team)) return "home";
  if (t === norm(match.away_team)) return "away";
  return null;
}

// ---------- Lineups ----------
export async function syncLineups(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };

  const res = await apiFootballGet<any[]>(`/fixtures/lineups?fixture=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };
  if (!res.data?.length) return { ok: true, lineups: 0 };

  const now = new Date().toISOString();
  let written = 0;
  for (const block of res.data) {
    const side = sideOfTeam(match, block?.team?.name ?? "");
    if (!side) continue;
    const starters = (block?.startXI ?? []).map((p: any) => ({
      id: p?.player?.id ?? null,
      name: p?.player?.name ?? "",
      number: p?.player?.number ?? null,
      pos: p?.player?.pos ?? null,
      grid: p?.player?.grid ?? null,
    }));
    const subs = (block?.substitutes ?? []).map((p: any) => ({
      id: p?.player?.id ?? null,
      name: p?.player?.name ?? "",
      number: p?.player?.number ?? null,
      pos: p?.player?.pos ?? null,
    }));
    await (supabaseAdmin as any).from("match_lineups").upsert(
      {
        match_id: match.id,
        side,
        formation: block?.formation ?? null,
        coach_name: block?.coach?.name ?? null,
        team_name: block?.team?.name ?? null,
        team_logo: block?.team?.logo ?? null,
        starters,
        substitutes: subs,
        fetched_at: now,
      },
      { onConflict: "match_id,side" },
    );
    written++;
  }
  return { ok: true, lineups: written };
}

// ---------- Events ----------
export async function syncEvents(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const res = await apiFootballGet<any[]>(`/fixtures/events?fixture=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };

  let inserted = 0;
  for (const e of res.data ?? []) {
    const side = sideOfTeam(match, e?.team?.name ?? "");
    const minute = e?.time?.elapsed ?? null;
    const extra = e?.time?.extra ?? null;
    const type = String(e?.type ?? "event");
    const detail = e?.detail ?? null;
    const player = e?.player?.name ?? null;
    const assist = e?.assist?.name ?? null;
    // Stable dedup: API returns "C. Gakpo" vs "Cody Gakpo" and "90+1" vs "91"
    // at different polling moments. Normalize by effective minute and last-name token.
    const effMin = (minute ?? 0) + (extra ?? 0);
    const lastName = String(player ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z\s]/g, "")
      .trim()
      .split(/\s+/)
      .pop() ?? "";
    const dedup = `${side ?? "x"}|${type.toLowerCase()}|${effMin}|${lastName}`;
    const { error } = await (supabaseAdmin as any).from("match_events").upsert(
      {
        match_id: match.id,
        minute,
        extra_minute: extra,
        side,
        type,
        detail,
        player_name: player,
        assist_name: assist,
        comments: e?.comments ?? null,
        dedup_key: dedup,
      },
      { onConflict: "match_id,dedup_key" },
    );
    if (!error) inserted++;
  }
  return { ok: true, events: inserted };
}

// ---------- Live score + status ----------
// Maps API-Football status.short -> our matches.status.
function mapStatus(short: string | null | undefined): string | null {
  const s = String(short ?? "").toUpperCase();
  if (!s) return null;
  if (["TBD", "NS", "PST", "CANC", "ABD", "AWD", "WO"].includes(s)) return "scheduled";
  if (["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"].includes(s)) return "live";
  if (["FT", "AET", "PEN"].includes(s)) return "finished";
  return null;
}

export async function syncScore(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const res = await apiFootballGet<any[]>(`/fixtures?id=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };
  const fx = res.data?.[0];
  if (!fx) return { ok: false, reason: "no fixture" };

  // SETTLEMENT-SAFE SCORE MAPPING (2026-07-04):
  // `fx.goals.*` is the running aggregate — during / after extra time it
  // holds the ET score, NOT the 90-minute regulation score. 90-min markets
  // (result / double_chance / O-U / BTTS / CS) MUST settle on regulation.
  //
  //   matches.home_score / away_score      = regulation (score.fulltime)
  //   matches.ft_home_score / ft_away_score = final incl. ET   (score.extratime || goals)
  //   matches.penalty_home_score / away    = shootout          (score.penalty)
  //
  // Feeding aggregate ET goals into home_score is the bug that caused the
  // Argentina/Cape Verde and Belgium/Senegal auto-reversal loops.
  const goalsHome = fx?.goals?.home;
  const goalsAway = fx?.goals?.away;
  const ftHome = fx?.score?.fulltime?.home;
  const ftAway = fx?.score?.fulltime?.away;
  const etHome = fx?.score?.extratime?.home;
  const etAway = fx?.score?.extratime?.away;
  const penHome = fx?.score?.penalty?.home;
  const penAway = fx?.score?.penalty?.away;
  const shortStatus = fx?.fixture?.status?.short ?? null;
  const elapsed = fx?.fixture?.status?.elapsed ?? null;
  const newStatus = mapStatus(shortStatus);
  const wentToET = shortStatus === "AET" || shortStatus === "PEN" || shortStatus === "ET" || shortStatus === "BT" || shortStatus === "P"
    || typeof etHome === "number" || typeof etAway === "number";

  // Regulation score. Prefer score.fulltime (present once 90' is played).
  // While live in the first 90', goals === fulltime so goals is safe.
  // Once ET starts, goals becomes aggregate — refuse to overwrite regulation.
  let regHome: number | null = null;
  let regAway: number | null = null;
  if (typeof ftHome === "number" && typeof ftAway === "number") {
    regHome = ftHome; regAway = ftAway;
  } else if (!wentToET && typeof goalsHome === "number" && typeof goalsAway === "number") {
    regHome = goalsHome; regAway = goalsAway;
  }

  // Aggregate final (ET included) for record-keeping and to_qualify grading.
  const aggHome: number | null =
    typeof etHome === "number" ? etHome
    : typeof goalsHome === "number" ? goalsHome
    : regHome;
  const aggAway: number | null =
    typeof etAway === "number" ? etAway
    : typeof goalsAway === "number" ? goalsAway
    : regAway;

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (regHome !== null) update.home_score = regHome;
  if (regAway !== null) update.away_score = regAway;
  if (aggHome !== null) update.ft_home_score = aggHome;
  if (aggAway !== null) update.ft_away_score = aggAway;
  if (typeof penHome === "number") update.penalty_home_score = penHome;
  if (typeof penAway === "number") update.penalty_away_score = penAway;
  if (shortStatus) update.live_status_short = shortStatus;
  if (typeof elapsed === "number") update.live_elapsed = elapsed;
  // Never downgrade a finished match back to live/scheduled.
  if (newStatus && !(match.status === "finished" && newStatus !== "finished")) {
    update.status = newStatus;
  }

  // Qualifier for to_qualify market (knockout only). Prefer explicit winner,
  // fall back to penalties, then ET aggregate.
  if (newStatus === "finished") {
    let qualifier: "HOME" | "AWAY" | null = null;
    const w = fx?.teams?.home?.winner === true ? "HOME"
      : fx?.teams?.away?.winner === true ? "AWAY" : null;
    if (w) qualifier = w;
    else if (typeof penHome === "number" && typeof penAway === "number" && penHome !== penAway) {
      qualifier = penHome > penAway ? "HOME" : "AWAY";
    } else if (aggHome !== null && aggAway !== null && aggHome !== aggAway) {
      qualifier = aggHome > aggAway ? "HOME" : "AWAY";
    }
    if (qualifier) update.qualifier = qualifier;
  }

  if (Object.keys(update).length > 1) {
    await (supabaseAdmin as any).from("matches").update(update).eq("id", match.id);
  }

  // Divergence alert: if the match has settled predictions AND regulation
  // now differs from the ET aggregate, flag for human review (no wallet writes).
  try {
    if (regHome !== null && aggHome !== null && (regHome !== aggHome || regAway !== aggAway)) {
      const { count } = await (supabaseAdmin as any)
        .from("predictions")
        .select("id", { count: "exact", head: true })
        .eq("match_id", match.id)
        .in("status", ["won", "lost"]);
      if ((count ?? 0) > 0) {
        await (supabaseAdmin as any).from("operational_alerts").insert({
          category: "settlement",
          severity: "high",
          title: "Regulation vs full-time score divergence",
          detail: `${match.home_team} vs ${match.away_team}: reg ${regHome}-${regAway}, ft ${aggHome}-${aggAway}. Settled bets exist — verify they graded on regulation.`,
          metadata: {
            match_id: match.id,
            reg_home: regHome, reg_away: regAway,
            ft_home: aggHome, ft_away: aggAway,
            settled_predictions: count,
          },
        });
      }
    }
  } catch (e) {
    console.log("[syncScore] divergence alert failed", e);
  }

  return { ok: true, home: regHome, away: regAway, ft_home: aggHome, ft_away: aggAway, status: newStatus };
}

// ---------- Statistics ----------
function pickStat(stats: any[], type: string): any {
  const row = stats?.find((s: any) => String(s?.type).toLowerCase() === type.toLowerCase());
  return row?.value ?? null;
}
function toInt(v: any): number | null {
  if (v == null) return null;
  if (typeof v === "string" && v.includes("%")) return parseInt(v.replace("%", ""), 10) || null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}
function toNum(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function syncStats(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const res = await apiFootballGet<any[]>(`/fixtures/statistics?fixture=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };

  const now = new Date().toISOString();
  let written = 0;
  for (const block of res.data ?? []) {
    const side = sideOfTeam(match, block?.team?.name ?? "");
    if (!side) continue;
    const s = block?.statistics ?? [];
    await (supabaseAdmin as any).from("match_stats").upsert(
      {
        match_id: match.id,
        side,
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
        fetched_at: now,
      },
      { onConflict: "match_id,side" },
    );
    written++;
  }
  return { ok: true, sides: written };
}

// ---------- Player ratings (post-match) ----------
export async function syncPlayerRatings(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const res = await apiFootballGet<any[]>(`/fixtures/players?fixture=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };
  const now = new Date().toISOString();
  let written = 0;
  for (const block of res.data ?? []) {
    const side = sideOfTeam(match, block?.team?.name ?? "");
    if (!side) continue;
    for (const p of block?.players ?? []) {
      const player = p?.player ?? {};
      const stats = (p?.statistics ?? [])[0] ?? {};
      await (supabaseAdmin as any).from("match_player_ratings").upsert(
        {
          match_id: match.id,
          side,
          player_id: player?.id ?? null,
          player_name: player?.name ?? "Unknown",
          number: stats?.games?.number ?? null,
          position: stats?.games?.position ?? null,
          minutes: stats?.games?.minutes ?? null,
          rating: toNum(stats?.games?.rating),
          goals: stats?.goals?.total ?? null,
          assists: stats?.goals?.assists ?? null,
          shots_total: stats?.shots?.total ?? null,
          shots_on: stats?.shots?.on ?? null,
          passes_total: stats?.passes?.total ?? null,
          passes_accuracy: toInt(stats?.passes?.accuracy),
          tackles: stats?.tackles?.total ?? null,
          yellow_cards: stats?.cards?.yellow ?? null,
          red_cards: stats?.cards?.red ?? null,
          fetched_at: now,
        },
        { onConflict: "match_id,side,player_name" },
      );
      written++;
    }
  }
  return { ok: true, players: written };
}

// ---------- Head to head ----------
function pairKey(a: string, b: string): string {
  const na = norm(a);
  const nb = norm(b);
  return na < nb ? `${na}__${nb}` : `${nb}__${na}`;
}

export async function syncH2H(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const key = pairKey(match.home_team, match.away_team);
  // We need API-Football team IDs; cheapest is to use fixture lookup to get them.
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const fxRes = await apiFootballGet<any[]>(`/fixtures?id=${fixtureId}`);
  if ("skipped" in fxRes) return { ok: false, reason: fxRes.reason };
  const fx = fxRes.data?.[0];
  const hid = fx?.teams?.home?.id;
  const aid = fx?.teams?.away?.id;
  if (!hid || !aid) return { ok: false, reason: "missing team ids" };

  const res = await apiFootballGet<any[]>(`/fixtures/headtohead?h2h=${hid}-${aid}&last=10`);
  if ("skipped" in res) return { ok: false, reason: res.reason };
  const fixtures = (res.data ?? []).map((f: any) => ({
    date: f?.fixture?.date,
    league: f?.league?.name,
    home: f?.teams?.home?.name,
    away: f?.teams?.away?.name,
    home_goals: f?.goals?.home,
    away_goals: f?.goals?.away,
  }));
  await (supabaseAdmin as any).from("match_h2h").upsert(
    {
      pair_key: key,
      team_a: match.home_team,
      team_b: match.away_team,
      fixtures,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: "pair_key" },
  );
  return { ok: true, fixtures: fixtures.length };
}

// ---------- Injuries ----------
export async function syncInjuries(matchId: string) {
  const match = await loadMatch(matchId);
  if (!match) return { ok: false, reason: "match not found" };
  const fixtureId = await resolveFixtureId(match);
  if (!fixtureId) return { ok: false, reason: "no fixture id" };
  const res = await apiFootballGet<any[]>(`/injuries?fixture=${fixtureId}`);
  if ("skipped" in res) return { ok: false, reason: res.reason };
  let written = 0;
  const now = new Date().toISOString();
  for (const row of res.data ?? []) {
    const side = sideOfTeam(match, row?.team?.name ?? "");
    if (!side) continue;
    await (supabaseAdmin as any).from("match_injuries").upsert(
      {
        match_id: match.id,
        side,
        player_name: row?.player?.name ?? "Unknown",
        position: row?.player?.position ?? null,
        type: row?.player?.type ?? null,
        reason: row?.player?.reason ?? null,
        fetched_at: now,
      },
      { onConflict: "match_id,side,player_name" },
    );
    written++;
  }
  return { ok: true, injuries: written };
}
