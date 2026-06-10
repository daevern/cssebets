// Shared football-data sync logic. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { settlePredictionsForMatch } from "@/lib/settlement.server";
import { runOddsSync } from "@/lib/odds.server";

function generateOdds() {
  return { home: 2.1, draw: 3.3, away: 3.4 };
}

export async function runFootballDataSync(opts: { userId?: string | null } = {}) {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY?.trim();
  if (!apiKey) {
    return { upserted: 0, total: 0, live: 0, autoSettled: 0, warning: "API key not configured" };
  }

  const headers = { "X-Auth-Token": apiKey };
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const dateFrom = fmt(new Date(now.getTime() - 2 * 86400000));
  const dateTo = fmt(new Date(now.getTime() + 8 * 86400000));
  const url = `https://api.football-data.org/v4/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;

  const r = await fetch(url, { headers });
  if (r.status !== 200) {
    return { upserted: 0, total: 0, live: 0, autoSettled: 0, warning: `Football-Data ${r.status}` };
  }
  const json = (await r.json()) as { matches?: any[] };
  const matches = json.matches ?? [];

  let upserted = 0, live = 0, autoSettled = 0;
  for (const m of matches) {
    const status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" =
      m.status === "FINISHED" ? "finished"
      : m.status === "IN_PLAY" || m.status === "PAUSED" || m.status === "LIVE" ? "live"
      : m.status === "POSTPONED" ? "postponed"
      : m.status === "CANCELLED" || m.status === "SUSPENDED" ? "cancelled"
      : "scheduled";
    if (status === "live") live++;

    const { data: existing } = await supabaseAdmin
      .from("matches").select("id, reference_odds").eq("external_id", String(m.id)).maybeSingle();

    const competition = m.competition?.name ?? null;
    const stageLabel = m.stage ? (competition ? `${competition} · ${m.stage}` : m.stage) : competition;
    const homeScore = m.score?.fullTime?.home ?? null;
    const awayScore = m.score?.fullTime?.away ?? null;
    const winner = status === "finished" && homeScore !== null && awayScore !== null
      ? (homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW") : null;

    const payload = {
      external_id: String(m.id),
      stage: stageLabel,
      group_name: m.group ?? null,
      home_team: m.homeTeam?.name ?? "TBD",
      away_team: m.awayTeam?.name ?? "TBD",
      home_crest: m.homeTeam?.crest ?? null,
      away_crest: m.awayTeam?.crest ?? null,
      kickoff_at: m.utcDate,
      status,
      home_score: homeScore,
      away_score: awayScore,
      winner,
      reference_odds: existing?.reference_odds ?? generateOdds(),
      updated_at: new Date().toISOString(),
    };

    const { data: upRow, error } = await supabaseAdmin
      .from("matches").upsert(payload, { onConflict: "external_id" }).select("id").single();
    if (!error) upserted++;

    const matchId = upRow?.id ?? existing?.id;
    if (matchId && status === "finished" && homeScore !== null && awayScore !== null) {
      autoSettled += await settlePredictionsForMatch(matchId, homeScore, awayScore);
    }
  }

  await supabaseAdmin.from("audit_log").insert({
    user_id: opts.userId ?? null, action: "matches.sync", entity: "matches", entity_id: null,
    metadata: { upserted, total: matches.length, live, autoSettled },
  });

  return { upserted, total: matches.length, live, autoSettled };
}
