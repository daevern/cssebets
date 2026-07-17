// Football sync engine: fixtures, odds, live scores.
// Writes to sports_events, sports_markets, sports_market_selections,
// sports_odds_snapshots, sports_sync_runs.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  FOOTBALL_COMPETITIONS,
  type FootballCompetitionCode,
} from "../config/footballCompetitions";
import {
  afFetchFixtures,
  afFetchOdds,
  afFetchLiveFixtures,
  afStatusToInternal,
} from "../adapters/apiFootballAdapter.server";
import { normalizeOdds } from "../adapters/marketMapper";

const TEAM_ALIASES: Record<string, string> = {};
function normTeam(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

async function startSyncRun(provider: string, jobType: string, competition?: string) {
  const { data } = await supabaseAdmin
    .from("sports_sync_runs" as any)
    .insert({
      provider,
      job_type: jobType,
      sport_code: "football",
      competition_code: competition,
      status: "running",
    })
    .select("id")
    .single();
  return (data as any)?.id as string | undefined;
}

async function finishSyncRun(
  id: string | undefined,
  status: "success" | "failed" | "partial",
  metrics: Partial<{
    records_fetched: number;
    records_created: number;
    records_updated: number;
    records_skipped: number;
    metadata: any;
  }> = {},
) {
  if (!id) return;
  await supabaseAdmin
    .from("sports_sync_runs" as any)
    .update({ status, finished_at: new Date().toISOString(), ...metrics })
    .eq("id", id);
}

async function logSyncError(runId: string | undefined, provider: string, message: string, detail?: any) {
  await supabaseAdmin.from("sports_sync_errors" as any).insert({
    sync_run_id: runId,
    provider,
    message,
    detail: detail ?? {},
  });
}

export type FootballSyncResult = {
  competition: FootballCompetitionCode;
  fixturesFetched: number;
  created: number;
  updated: number;
  errors: string[];
};

// ---------- FIXTURES ----------
export async function syncFootballFixtures(
  code: FootballCompetitionCode,
  opts: { daysAhead?: number } = {},
): Promise<FootballSyncResult> {
  const cfg = FOOTBALL_COMPETITIONS[code];
  const daysAhead = opts.daysAhead ?? 14;
  const runId = await startSyncRun("api-football", "fixtures", code);
  const errors: string[] = [];
  let created = 0;
  let updated = 0;

  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + daysAhead * 86400_000).toISOString().slice(0, 10);
  const res = await afFetchFixtures(cfg.apiFootballLeagueId, cfg.currentSeason, { from, to });
  if (!res.ok) {
    await logSyncError(runId, "api-football", res.reason);
    await finishSyncRun(runId, "failed", { records_fetched: 0 });
    return { competition: code, fixturesFetched: 0, created: 0, updated: 0, errors: [res.reason] };
  }

  for (const f of res.data) {
    try {
      const statusMap = afStatusToInternal(f.fixture.status.short);
      const providerFixtureId = String(f.fixture.id);

      // Check mapping first — one internal event per API-Football fixture id.
      const { data: existingMapping } = await supabaseAdmin
        .from("sports_event_provider_mappings" as any)
        .select("sports_event_id")
        .eq("provider", "api-football")
        .eq("provider_event_id", providerFixtureId)
        .maybeSingle();

      const eventPayload = {
        sport_code: "football",
        competition_code: code,
        season: String(cfg.currentSeason),
        round: f.league.round,
        event_name: `${f.teams.home.name} vs ${f.teams.away.name}`,
        home_name: f.teams.home.name,
        away_name: f.teams.away.name,
        home_logo: f.teams.home.logo,
        away_logo: f.teams.away.logo,
        home_provider_id: String(f.teams.home.id),
        away_provider_id: String(f.teams.away.id),
        venue: f.fixture.venue?.name ?? null,
        timezone: f.fixture.timezone,
        scheduled_at: f.fixture.date,
        status: statusMap.status,
        live_minute: f.fixture.status.elapsed,
        home_score: f.goals.home,
        away_score: f.goals.away,
        source_metadata: { api_football: { fixture_id: f.fixture.id, league_logo: f.league.logo } },
      } as any;

      if (existingMapping) {
        await supabaseAdmin
          .from("sports_events" as any)
          .update(eventPayload)
          .eq("id", (existingMapping as any).sports_event_id);
        updated++;
      } else {
        const { data: newEvent, error } = await supabaseAdmin
          .from("sports_events" as any)
          .insert(eventPayload)
          .select("id")
          .single();
        if (error) throw error;
        await supabaseAdmin.from("sports_event_provider_mappings" as any).insert({
          sports_event_id: (newEvent as any).id,
          provider: "api-football",
          provider_event_id: providerFixtureId,
          provider_competition_id: String(cfg.apiFootballLeagueId),
          match_confidence: 1.0,
          mapping_method: "direct_provider_id",
          mapping_status: "confirmed",
        });
        created++;
      }
    } catch (e: any) {
      errors.push(e?.message ?? String(e));
      await logSyncError(runId, "api-football", e?.message ?? String(e), { fixture_id: f.fixture.id });
    }
  }

  await finishSyncRun(runId, errors.length ? "partial" : "success", {
    records_fetched: res.data.length,
    records_created: created,
    records_updated: updated,
  });
  return { competition: code, fixturesFetched: res.data.length, created, updated, errors };
}

export async function syncAllFootballFixtures(): Promise<FootballSyncResult[]> {
  const results: FootballSyncResult[] = [];
  for (const cfg of Object.values(FOOTBALL_COMPETITIONS)) {
    // Only sync if the competition's feature flag is enabled
    const { data: flag } = await supabaseAdmin
      .from("sports_feature_flags" as any)
      .select("enabled")
      .eq("key", cfg.featureFlagKey)
      .maybeSingle();
    if (!(flag as any)?.enabled) continue;
    results.push(await syncFootballFixtures(cfg.code));
  }
  return results;
}

// ---------- ODDS ----------
export async function syncFootballOddsForEvent(eventId: string): Promise<{
  ok: boolean;
  reason?: string;
  marketsUpserted: number;
}> {
  const { data: mapping } = await supabaseAdmin
    .from("sports_event_provider_mappings" as any)
    .select("provider_event_id")
    .eq("sports_event_id", eventId)
    .eq("provider", "api-football")
    .maybeSingle();
  if (!mapping) return { ok: false, reason: "no api-football mapping", marketsUpserted: 0 };

  const fixtureId = Number((mapping as any).provider_event_id);
  const res = await afFetchOdds(fixtureId);
  if (!res.ok) return { ok: false, reason: res.reason, marketsUpserted: 0 };
  const payload = res.data?.[0];
  if (!payload || !payload.bookmakers?.length) {
    return { ok: false, reason: "no bookmakers yet", marketsUpserted: 0 };
  }

  const markets = normalizeOdds(payload);
  const now = new Date().toISOString();
  let count = 0;

  for (const m of markets) {
    const { data: mUp, error: mErr } = await supabaseAdmin
      .from("sports_markets" as any)
      .upsert(
        {
          sports_event_id: eventId,
          market_key: m.marketKey,
          display_name: m.displayName,
          category: m.category,
          period: m.period,
          line: m.line,
          provider: "api-football",
          status: "open",
          sort_order: m.sortOrder,
        },
        { onConflict: "sports_event_id,market_key,period,line" } as any,
      )
      .select("id")
      .single();
    if (mErr || !mUp) continue;
    const marketId = (mUp as any).id;

    for (const sel of m.selections) {
      await supabaseAdmin
        .from("sports_market_selections" as any)
        .upsert(
          {
            sports_market_id: marketId,
            selection_key: sel.selectionKey,
            display_name: sel.displayName,
            line: sel.line,
            decimal_odds: sel.decimalOdds,
            status: "open",
            sort_order: sel.sortOrder,
          },
          { onConflict: "sports_market_id,selection_key" } as any,
        );

      await supabaseAdmin.from("sports_odds_snapshots" as any).insert({
        sports_event_id: eventId,
        sports_market_id: marketId,
        market_key: m.marketKey,
        selection_key: sel.selectionKey,
        provider: "api-football",
        decimal_odds: sel.decimalOdds,
        provider_ts: payload.update ?? now,
      });
      count++;
    }
  }

  return { ok: true, marketsUpserted: count };
}

export async function syncFootballOddsBatch(opts: {
  maxEvents?: number;
  freshnessMinutes?: number;
} = {}): Promise<{ processed: number; errors: string[] }> {
  const maxEvents = opts.maxEvents ?? 8;
  const freshness = opts.freshnessMinutes ?? 15;
  const runId = await startSyncRun("api-football", "odds");
  const errors: string[] = [];

  const staleBefore = new Date(Date.now() - freshness * 60_000).toISOString();
  const horizon = new Date(Date.now() + 3 * 86400_000).toISOString();

  // Pick scheduled events in the next 72h whose latest odds snapshot is stale
  const { data: events } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id, scheduled_at, updated_at")
    .eq("sport_code", "football")
    .eq("status", "scheduled")
    .gt("scheduled_at", new Date().toISOString())
    .lt("scheduled_at", horizon)
    .order("scheduled_at", { ascending: true })
    .limit(maxEvents * 3);

  let processed = 0;
  for (const ev of events ?? []) {
    // Skip if we have very recent odds snapshot for this event
    const { count } = await supabaseAdmin
      .from("sports_odds_snapshots" as any)
      .select("*", { count: "exact", head: true })
      .eq("sports_event_id", (ev as any).id)
      .gt("fetched_at", staleBefore);
    if ((count ?? 0) > 0) continue;

    const r = await syncFootballOddsForEvent((ev as any).id);
    if (!r.ok && r.reason) errors.push(`${(ev as any).id}: ${r.reason}`);
    processed++;
    if (processed >= maxEvents) break;
  }

  await finishSyncRun(runId, errors.length ? "partial" : "success", { records_updated: processed });
  return { processed, errors };
}

// ---------- LIVE ----------
export async function syncFootballLiveScores(): Promise<{ updated: number }> {
  const runId = await startSyncRun("api-football", "live");
  let updated = 0;
  for (const cfg of Object.values(FOOTBALL_COMPETITIONS)) {
    const { data: flag } = await supabaseAdmin
      .from("sports_feature_flags" as any)
      .select("enabled")
      .eq("key", cfg.featureFlagKey)
      .maybeSingle();
    if (!(flag as any)?.enabled) continue;
    const live = await afFetchLiveFixtures(cfg.apiFootballLeagueId);
    if (!live.ok) continue;
    for (const f of live.data) {
      const providerId = String(f.fixture.id);
      const { data: mapping } = await supabaseAdmin
        .from("sports_event_provider_mappings" as any)
        .select("sports_event_id")
        .eq("provider", "api-football")
        .eq("provider_event_id", providerId)
        .maybeSingle();
      if (!mapping) continue;
      const statusMap = afStatusToInternal(f.fixture.status.short);
      await supabaseAdmin
        .from("sports_events" as any)
        .update({
          status: statusMap.status,
          live_minute: f.fixture.status.elapsed,
          home_score: f.goals.home,
          away_score: f.goals.away,
        })
        .eq("id", (mapping as any).sports_event_id);
      updated++;
    }
  }
  await finishSyncRun(runId, "success", { records_updated: updated });
  return { updated };
}
