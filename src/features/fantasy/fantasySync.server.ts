/**
 * Fantasy XI background jobs: player pool refresh, gameweek lifecycle,
 * scoring from the API-Football match feed, and prize settlement.
 *
 * Server-only. Never import from client-reachable modules at module scope.
 */
import {
  afFetchFixturePlayers,
  afFetchTeamPlayers,
} from "@/features/football/adapters/apiFootballAdapter.server";
import { FOOTBALL_COMPETITIONS } from "@/features/football/config/footballCompetitions";
import { scorePlayer, prizeFor, type FantasyPosition, type FantasyStatLine } from "./scoring";

const COMPETITIONS = ["EPL", "LA_LIGA", "SERIE_A"] as const;

function mapPosition(raw: string | null | undefined): FantasyPosition | null {
  const p = (raw ?? "").toLowerCase();
  if (p.startsWith("goal") || p === "g") return "GK";
  if (p.startsWith("def") || p === "d") return "DEF";
  if (p.startsWith("mid") || p === "m") return "MID";
  if (p.startsWith("att") || p.startsWith("for") || p === "f") return "FWD";
  return null;
}

const BASE_PRICE: Record<FantasyPosition, number> = { GK: 4.5, DEF: 4.5, MID: 5.5, FWD: 6.0 };

function priceFor(pos: FantasyPosition, goals: number, assists: number, rating: number | null) {
  let price = BASE_PRICE[pos];
  price += goals * (pos === "FWD" ? 0.4 : pos === "MID" ? 0.5 : 0.7);
  price += assists * 0.3;
  if (rating && rating > 6.8) price += (rating - 6.8) * 4;
  return Math.max(4, Math.min(14, Math.round(price * 2) / 2));
}

function seasonLabel(): string {
  return String(FOOTBALL_COMPETITIONS.EPL.currentSeason);
}

function isoWeek(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

function weekWindow(now: Date) {
  const start = new Date(now);
  const day = start.getUTCDay() || 7; // Mon = 1
  start.setUTCDate(start.getUTCDate() - (day - 1));
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

/** Refresh the selectable player pool for the three leagues. */
export async function syncFantasyPlayerPool(opts: { maxTeams?: number } = {}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const season = FOOTBALL_COMPETITIONS.EPL.currentSeason;

  const { data: events } = await (supabaseAdmin as any)
    .from("sports_events")
    .select("competition_code, home_name, home_provider_id, home_logo, away_name, away_provider_id, away_logo")
    .in("competition_code", COMPETITIONS as unknown as string[]);

  const teams = new Map<number, { name: string; logo: string | null; code: string }>();
  for (const e of (events ?? []) as any[]) {
    if (e.home_provider_id) {
      teams.set(Number(e.home_provider_id), {
        name: e.home_name,
        logo: e.home_logo ?? null,
        code: e.competition_code,
      });
    }
    if (e.away_provider_id) {
      teams.set(Number(e.away_provider_id), {
        name: e.away_name,
        logo: e.away_logo ?? null,
        code: e.competition_code,
      });
    }
  }

  const list = [...teams.entries()].slice(0, opts.maxTeams ?? 20);
  let upserted = 0;
  const failures: string[] = [];

  for (const [teamId, team] of list) {
    const res = await afFetchTeamPlayers(teamId, season, 1);
    if (!res.ok) {
      failures.push(`${team.name}: ${res.reason}`);
      continue;
    }
    const rows: any[] = [];
    for (const p of res.data ?? []) {
      const stat = p.statistics?.[0];
      const pos = mapPosition(stat?.games?.position);
      if (!pos) continue;
      const goals = Number(stat?.goals?.total ?? 0);
      const assists = Number(stat?.goals?.assists ?? 0);
      const rating = stat?.games?.rating ? Number(stat.games.rating) : null;
      rows.push({
        provider_player_id: p.player.id,
        name: p.player.name,
        photo: p.player.photo,
        position: pos,
        team_name: team.name,
        team_provider_id: teamId,
        team_logo: team.logo,
        competition_code: team.code,
        price: priceFor(pos, goals, assists, Number.isFinite(rating as number) ? rating : null),
        is_active: true,
        updated_at: new Date().toISOString(),
      });
    }
    if (rows.length) {
      const { error } = await (supabaseAdmin as any)
        .from("fantasy_players")
        .upsert(rows, { onConflict: "provider_player_id" });
      if (error) failures.push(`${team.name}: ${error.message}`);
      else upserted += rows.length;
    }
  }

  return { teams: list.length, players: upserted, failures };
}

/** Make sure the current week's round exists and its status matches the clock. */
export async function ensureCurrentGameweek() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const now = new Date();
  const { start, end } = weekWindow(now);
  const season = seasonLabel();
  const number = isoWeek(start);

  const { data: existing } = await (supabaseAdmin as any)
    .from("fantasy_gameweeks")
    .select("*")
    .eq("season", season)
    .eq("number", number)
    .maybeSingle();

  // Deadline = first kickoff inside the window across the three leagues.
  const { data: firstFixture } = await (supabaseAdmin as any)
    .from("sports_events")
    .select("scheduled_at")
    .in("competition_code", COMPETITIONS as unknown as string[])
    .gte("scheduled_at", start.toISOString())
    .lt("scheduled_at", end.toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const deadline = firstFixture?.scheduled_at
    ? new Date(firstFixture.scheduled_at)
    : new Date(start.getTime() + 3 * 86_400_000);

  let row = existing;
  if (!row) {
    const { data: created, error } = await (supabaseAdmin as any)
      .from("fantasy_gameweeks")
      .insert({
        season,
        number,
        name: `Gameweek ${number}`,
        starts_at: start.toISOString(),
        deadline_at: deadline.toISOString(),
        ends_at: end.toISOString(),
        entry_fee: 100,
        status: "open",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    row = created;
  }

  const status =
    now >= new Date(row.ends_at)
      ? "live"
      : now >= new Date(row.deadline_at)
        ? "live"
        : "open";
  if (row.status !== "settled" && row.status !== status) {
    await (supabaseAdmin as any)
      .from("fantasy_gameweeks")
      .update({ status })
      .eq("id", row.id);
    row.status = status;
  }
  return row;
}

async function scoreGameweek(gw: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: events } = await (supabaseAdmin as any)
    .from("sports_events")
    .select("id, competition_code, home_provider_id, away_provider_id, home_score, away_score, source_metadata")
    .in("competition_code", COMPETITIONS as unknown as string[])
    .eq("status", "finished")
    .gte("scheduled_at", gw.starts_at)
    .lt("scheduled_at", gw.ends_at)
    .limit(60);

  const { data: pool } = await (supabaseAdmin as any)
    .from("fantasy_players")
    .select("id, provider_player_id, position");
  const byProvider = new Map<number, { id: string; position: FantasyPosition }>(
    ((pool ?? []) as any[]).map((p) => [Number(p.provider_player_id), { id: p.id, position: p.position }]),
  );

  let scored = 0;
  for (const ev of (events ?? []) as any[]) {
    const fixtureId = Number(ev.source_metadata?.api_football?.fixture_id ?? 0);
    if (!fixtureId) continue;

    // Skip fixtures already fully ingested for this round.
    const { count } = await (supabaseAdmin as any)
      .from("fantasy_player_scores")
      .select("id", { count: "exact", head: true })
      .eq("gameweek_id", gw.id)
      .eq("event_id", ev.id);
    if ((count ?? 0) > 0) continue;

    const res = await afFetchFixturePlayers(fixtureId);
    if (!res.ok) continue;

    const rows: any[] = [];
    for (const teamBlock of res.data ?? []) {
      const isHome = Number(teamBlock.team.id) === Number(ev.home_provider_id);
      const conceded = isHome ? Number(ev.away_score ?? 0) : Number(ev.home_score ?? 0);
      for (const entry of teamBlock.players ?? []) {
        const known = byProvider.get(Number(entry.player.id));
        if (!known) continue;
        const st = entry.statistics?.[0];
        if (!st) continue;
        const line: FantasyStatLine = {
          minutes: Number(st.games?.minutes ?? 0),
          goals: Number(st.goals?.total ?? 0),
          assists: Number(st.goals?.assists ?? 0),
          cleanSheet: conceded === 0,
          goalsConceded: Number(st.goals?.conceded ?? conceded),
          saves: Number(st.goals?.saves ?? 0),
          yellowCards: Number(st.cards?.yellow ?? 0),
          redCards: Number(st.cards?.red ?? 0),
          ownGoals: 0,
          penaltiesMissed: Number(st.penalty?.missed ?? 0),
          penaltiesSaved: Number(st.penalty?.saved ?? 0),
        };
        rows.push({
          gameweek_id: gw.id,
          player_id: known.id,
          event_id: ev.id,
          minutes: line.minutes,
          goals: line.goals,
          assists: line.assists,
          clean_sheet: line.cleanSheet && line.minutes >= 60,
          goals_conceded: line.goalsConceded,
          saves: line.saves,
          yellow_cards: line.yellowCards,
          red_cards: line.redCards,
          own_goals: 0,
          penalties_missed: line.penaltiesMissed,
          penalties_saved: line.penaltiesSaved,
          rating: st.games?.rating ? Number(st.games.rating) : null,
          points: scorePlayer(known.position, line),
          updated_at: new Date().toISOString(),
        });
      }
    }
    if (rows.length) {
      const { error } = await (supabaseAdmin as any)
        .from("fantasy_player_scores")
        .upsert(rows, { onConflict: "gameweek_id,player_id,event_id" });
      if (!error) scored += rows.length;
    }
  }

  await recomputeEntryPoints(gw.id);
  return scored;
}

/** Recalculate every squad's total for a round (captain counts double). */
export async function recomputeEntryPoints(gameweekId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: scores } = await (supabaseAdmin as any)
    .from("fantasy_player_scores")
    .select("player_id, points")
    .eq("gameweek_id", gameweekId);
  const totals = new Map<string, number>();
  for (const s of (scores ?? []) as any[]) {
    totals.set(s.player_id, (totals.get(s.player_id) ?? 0) + Number(s.points ?? 0));
  }

  const { data: entries } = await (supabaseAdmin as any)
    .from("fantasy_entries")
    .select("id, fantasy_entry_players(id, player_id, role)")
    .eq("gameweek_id", gameweekId);

  for (const entry of (entries ?? []) as any[]) {
    let total = 0;
    for (const pick of entry.fantasy_entry_players ?? []) {
      const base = totals.get(pick.player_id) ?? 0;
      const pts = pick.role === "captain" ? base * 2 : base;
      total += pts;
      await (supabaseAdmin as any)
        .from("fantasy_entry_players")
        .update({ points: pts })
        .eq("id", pick.id);
    }
    await (supabaseAdmin as any)
      .from("fantasy_entries")
      .update({ points: total })
      .eq("id", entry.id);
  }

  // Rank in memory, then persist.
  const { data: ranked } = await (supabaseAdmin as any)
    .from("fantasy_entries")
    .select("id, points")
    .eq("gameweek_id", gameweekId)
    .order("points", { ascending: false });
  let rank = 0;
  let lastPoints: number | null = null;
  let seen = 0;
  for (const e of (ranked ?? []) as any[]) {
    seen += 1;
    if (lastPoints === null || Number(e.points) !== lastPoints) {
      rank = seen;
      lastPoints = Number(e.points);
    }
    await (supabaseAdmin as any).from("fantasy_entries").update({ rank }).eq("id", e.id);
  }
}

/** Pay out a finished round and roll the results into the season table. */
export async function settleGameweek(gw: any) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { rpcWalletApplyChange } = await import("@/lib/supabase-rpc.server");

  await recomputeEntryPoints(gw.id);

  const { data: entries } = await (supabaseAdmin as any)
    .from("fantasy_entries")
    .select("id, user_id, points, rank, status")
    .eq("gameweek_id", gw.id)
    .order("points", { ascending: false });

  const list = ((entries ?? []) as any[]).filter((e) => e.status !== "settled");
  const entrants = (entries ?? []).length;
  const pool = Number(gw.prize_pool ?? 0);

  for (const e of list) {
    const prize = prizeFor(Number(e.rank ?? 0), pool, entrants);
    if (prize > 0) {
      const { error } = await rpcWalletApplyChange({
        p_user_id: e.user_id,
        p_type: "credit",
        p_amount: prize,
        p_reference_type: "fantasy_prize" as any,
        p_reference_id: e.id,
        p_note: `Fantasy XI ${gw.name} — rank ${e.rank}`,
      } as any);
      if (error) {
        console.error("[fantasy] prize payout failed", e.id, error.message);
        continue;
      }
    }
    await (supabaseAdmin as any)
      .from("fantasy_entries")
      .update({ status: "settled", prize })
      .eq("id", e.id);

    const { data: standing } = await (supabaseAdmin as any)
      .from("fantasy_season_standings")
      .select("id, points, entries, prize_total")
      .eq("season", gw.season)
      .eq("user_id", e.user_id)
      .maybeSingle();
    const next = {
      season: gw.season,
      user_id: e.user_id,
      points: Number(standing?.points ?? 0) + Number(e.points ?? 0),
      entries: Number(standing?.entries ?? 0) + 1,
      prize_total: Number(standing?.prize_total ?? 0) + prize,
      updated_at: new Date().toISOString(),
    };
    await (supabaseAdmin as any)
      .from("fantasy_season_standings")
      .upsert(next, { onConflict: "season,user_id" });
  }

  await (supabaseAdmin as any)
    .from("fantasy_gameweeks")
    .update({ status: "settled", settled_at: new Date().toISOString() })
    .eq("id", gw.id);

  return { entrants, paid: list.length };
}

/** Single cron entry point. */
export async function runFantasySync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count: poolCount } = await (supabaseAdmin as any)
    .from("fantasy_players")
    .select("id", { count: "exact", head: true });
  let pool: any = { skipped: true };
  if ((poolCount ?? 0) === 0) {
    pool = await syncFantasyPlayerPool({ maxTeams: 20 });
  } else {
    const { data: stale } = await (supabaseAdmin as any)
      .from("fantasy_players")
      .select("updated_at")
      .order("updated_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const staleAt = stale?.updated_at ? new Date(stale.updated_at).getTime() : 0;
    if (Date.now() - staleAt > 3 * 86_400_000) {
      pool = await syncFantasyPlayerPool({ maxTeams: 10 });
    }
  }

  const current = await ensureCurrentGameweek();

  const { data: due } = await (supabaseAdmin as any)
    .from("fantasy_gameweeks")
    .select("*")
    .neq("status", "settled")
    .order("starts_at", { ascending: true })
    .limit(3);

  const rounds: any[] = [];
  for (const gw of (due ?? []) as any[]) {
    const scored = await scoreGameweek(gw);
    let settled: any = null;
    if (new Date() >= new Date(new Date(gw.ends_at).getTime() + 6 * 3_600_000)) {
      settled = await settleGameweek(gw);
    }
    rounds.push({ gameweek: gw.name, scored, settled });
  }

  return { pool, current: current?.name, rounds };
}
