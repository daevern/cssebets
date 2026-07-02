// Shared football-data sync logic. Server-only.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { settlePredictionsForMatch } from "@/lib/settlement.server";
import { runOddsSync } from "@/lib/odds.server";

// HOTFIX: generated/fake reference odds are NEVER allowed for real matches.
// Real matches must rely solely on provider odds (runOddsSync). If provider
// odds are missing, reference_odds stays NULL and refresh_odds_status_for_open_matches
// will mark the match as 'missing' / 'awaiting_sync' and auto-suspend it.

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
  const settlementWarnings: string[] = [];
  for (const m of matches) {
    const status: "scheduled" | "live" | "finished" | "postponed" | "cancelled" =
      m.status === "FINISHED" ? "finished"
      : m.status === "IN_PLAY" || m.status === "PAUSED" || m.status === "LIVE" ? "live"
      : m.status === "POSTPONED" ? "postponed"
      : m.status === "CANCELLED" || m.status === "SUSPENDED" ? "cancelled"
      : "scheduled";
    if (status === "live") live++;

    const { data: existing } = await supabaseAdmin
      .from("matches").select("id, status, reference_odds").eq("external_id", String(m.id)).maybeSingle();

    const competition = m.competition?.name ?? null;
    const stageLabel = m.stage ? (competition ? `${competition} · ${m.stage}` : m.stage) : competition;
    // SETTLEMENT POLICY: 90-minute whistle ONLY for goal-based markets.
    // `score.fullTime` is the AGGREGATE (regulation + extra time + shootout
    // goals). The 90-min score lives in `score.regularTime`. Markets priced
    // for 90 minutes (Result, O/U, BTTS, CS, Exact Goals, HT/FT) grade on
    // regulation only.
    //
    // The "To Qualify / Advance" market is the exception: it grades on who
    // actually advances after ET and penalties. We derive that from
    // `score.winner` (HOME_TEAM/AWAY_TEAM) when the stage is a knockout.
    const duration: string | null = m.score?.duration ?? null;
    const regHome = m.score?.regularTime?.home ?? null;
    const regAway = m.score?.regularTime?.away ?? null;
    const ftHome = m.score?.fullTime?.home ?? null;
    const ftAway = m.score?.fullTime?.away ?? null;
    const homeScore = regHome ?? (duration === "REGULAR" || duration == null ? ftHome : null);
    const awayScore = regAway ?? (duration === "REGULAR" || duration == null ? ftAway : null);
    const homeScoreHt = m.score?.halfTime?.home ?? null;
    const awayScoreHt = m.score?.halfTime?.away ?? null;
    const winner = status === "finished" && homeScore !== null && awayScore !== null
      ? (homeScore > awayScore ? "HOME" : homeScore < awayScore ? "AWAY" : "DRAW") : null;

    // Qualifier: who advances on a knockout tie (used for to_qualify market).
    // Prefer football-data's `score.winner` (HOME_TEAM/AWAY_TEAM) on finished
    // matches because it already reflects ET + penalty shootout outcomes. If
    // it reports DRAW (group stage), leave qualifier NULL.
    const isKnockoutStage = typeof m.stage === "string" && /FINAL|SEMI|QUARTER|ROUND_OF|LAST_/i.test(m.stage);
    let qualifier: "HOME" | "AWAY" | null = null;
    if (status === "finished" && isKnockoutStage) {
      const w = m.score?.winner;
      if (w === "HOME_TEAM") qualifier = "HOME";
      else if (w === "AWAY_TEAM") qualifier = "AWAY";
      else if (ftHome !== null && ftAway !== null && ftHome !== ftAway) {
        qualifier = ftHome > ftAway ? "HOME" : "AWAY";
      } else if (m.score?.penalties) {
        const ph = m.score.penalties.home ?? null;
        const pa = m.score.penalties.away ?? null;
        if (ph !== null && pa !== null && ph !== pa) {
          qualifier = ph > pa ? "HOME" : "AWAY";
        }
      }
    }

    const payload: any = {
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
      home_score_ht: homeScoreHt,
      away_score_ht: awayScoreHt,
      ft_home_score: ftHome,
      ft_away_score: ftAway,
      winner,
      qualifier,
      reference_odds: existing?.reference_odds ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: upRow, error } = await supabaseAdmin
      .from("matches").upsert(payload, { onConflict: "external_id" }).select("id").single();
    if (!error) upserted++;

    const matchId = upRow?.id ?? existing?.id;
    if (matchId && status === "finished" && homeScore !== null && awayScore !== null) {
      const justFinished = existing?.status !== "finished";
      const { data: pendingPrediction } = justFinished
        ? { data: { id: "transition" } }
        : await supabaseAdmin
            .from("predictions")
            .select("id")
            .eq("match_id", matchId)
            .eq("status", "pending")
            .limit(1)
            .maybeSingle();

      if (pendingPrediction) {
        try {
          autoSettled += await settlePredictionsForMatch(matchId, homeScore, awayScore, homeScoreHt, awayScoreHt, qualifier);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          settlementWarnings.push(`${payload.home_team} vs ${payload.away_team}: ${message}`);
        }
      }
    }
  }

  await supabaseAdmin.from("audit_log").insert({
    user_id: opts.userId ?? null, action: "matches.sync", entity: "matches", entity_id: null,
    metadata: { upserted, total: matches.length, live, autoSettled, settlementWarnings },
  });

  // Refresh real odds (throttled to once every 2h to stay within free tier).
  let odds: Awaited<ReturnType<typeof runOddsSync>> | null = null;
  try { odds = await runOddsSync(); } catch (e) { console.log("[odds] sync failed", e); }

  // Refresh odds_status (trusted/stale/missing) + raise alerts for open matches.
  try {
    await (supabaseAdmin as any).rpc("refresh_odds_status_for_open_matches");
  } catch (e) { console.log("[odds-status] refresh failed", e); }

  return {
    upserted,
    total: matches.length,
    live,
    autoSettled,
    odds,
    warning: settlementWarnings.length ? settlementWarnings.slice(0, 3).join("; ") : undefined,
  };
}
