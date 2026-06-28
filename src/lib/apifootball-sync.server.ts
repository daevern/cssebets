// Server-only: fetch real bookmaker odds from API-Football and write them
// into match_market_odds + matches.reference_odds for one match at a time.
//
// Quota cost per match:
//   - 1 request to /fixtures (only if apifootball_fixture_id not yet cached)
//   - 1 request to /odds
// Once a match's fixture id is resolved, subsequent refreshes cost 1 req.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiFootballGet, WC_LEAGUE_ID, WC_SEASON } from "./apifootball.server";
import { parseBookmakerPayload, type ParsedOdds } from "./apifootball-mapping";
import { apply3WayMargin, getRealOddsMarginSettings } from "./odds-margin.server";

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

type Match = {
  id: string;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: string;
  margin_disabled: boolean | null;
  apifootball_fixture_id: number | null;
};

async function loadMatch(matchId: string): Promise<Match | null> {
  const { data } = await supabaseAdmin
    .from("matches")
    .select("id, home_team, away_team, kickoff_at, status, margin_disabled, apifootball_fixture_id")
    .eq("id", matchId)
    .maybeSingle();
  return (data as any) ?? null;
}

async function resolveFixtureId(match: Match): Promise<{ fixtureId: number | null; quotaSpent: number; note?: string }> {
  if (match.apifootball_fixture_id) return { fixtureId: match.apifootball_fixture_id, quotaSpent: 0 };

  const date = match.kickoff_at.slice(0, 10);
  const res = await apiFootballGet<any[]>(
    `/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}&date=${date}`,
  );
  if ("skipped" in res) return { fixtureId: null, quotaSpent: 0, note: res.reason };

  const home = norm(match.home_team);
  const away = norm(match.away_team);
  let found: any = null;
  for (const f of res.data ?? []) {
    const h = norm(f?.teams?.home?.name ?? "");
    const a = norm(f?.teams?.away?.name ?? "");
    if ((h === home && a === away) || (h === away && a === home)) {
      found = f;
      break;
    }
  }
  if (!found) return { fixtureId: null, quotaSpent: 1, note: "no fixture match by team names" };

  const fixtureId = Number(found?.fixture?.id);
  if (!fixtureId) return { fixtureId: null, quotaSpent: 1, note: "fixture has no id" };

  await supabaseAdmin
    .from("matches")
    .update({ apifootball_fixture_id: fixtureId, updated_at: new Date().toISOString() } as any)
    .eq("id", match.id);
  return { fixtureId, quotaSpent: 1 };
}

// Apply margin to a list of mutually-exclusive selections (e.g. all 25 correct
// scores). For BTTS / O-U we treat them as 2-way; for CS / HT-FT / Exact we
// normalize across all selections.
async function houseAdjust(market: string, raw: ParsedOdds[]): Promise<ParsedOdds[]> {
  const { marginPct, apply } = await getRealOddsMarginSettings();
  if (!apply || raw.length === 0) return raw;
  const sum = raw.reduce((s, r) => s + 1 / Math.max(r.odds, 1.001), 0);
  const mult = 1 + marginPct / 100;
  return raw.map((r) => {
    const pFair = 1 / Math.max(r.odds, 1.001) / sum;
    const pHouse = Math.min(0.999, pFair * mult);
    const adj = Math.max(1.01, Math.round((1 / pHouse) * 100) / 100);
    return { ...r, odds: adj };
  });
}

export type SyncResult = {
  matchId: string;
  status: "ok" | "skipped" | "no_fixture" | "no_odds" | "quota_exhausted";
  bookmakers?: number;
  markets?: number;
  quotaSpent: number;
  quotaRemaining?: number;
  note?: string;
};

export async function syncMatchOddsApiFootball(matchId: string): Promise<SyncResult> {
  const match = await loadMatch(matchId);
  if (!match) return { matchId, status: "skipped", quotaSpent: 0, note: "match not found" };
  if (match.status !== "scheduled") {
    return { matchId, status: "skipped", quotaSpent: 0, note: `status=${match.status}` };
  }

  const resolved = await resolveFixtureId(match);
  if (!resolved.fixtureId) {
    return {
      matchId,
      status: resolved.note === "daily quota exhausted" ? "quota_exhausted" : "no_fixture",
      quotaSpent: resolved.quotaSpent,
      note: resolved.note,
    };
  }

  const oddsRes = await apiFootballGet<any[]>(`/odds?fixture=${resolved.fixtureId}`);
  if ("skipped" in oddsRes) {
    return {
      matchId,
      status: "quota_exhausted",
      quotaSpent: resolved.quotaSpent,
      note: oddsRes.reason,
      quotaRemaining: oddsRes.quota.remaining,
    };
  }

  const bookmakers = oddsRes.data?.[0]?.bookmakers ?? [];
  if (!bookmakers.length) {
    return {
      matchId,
      status: "no_odds",
      quotaSpent: resolved.quotaSpent + 1,
      quotaRemaining: oddsRes.quota.remaining,
      note: "no bookmakers yet",
    };
  }

  // Archive raw payload for audit / replay
  await supabaseAdmin.from("apifootball_odds_raw" as any).insert({
    match_id: match.id,
    fixture_id: resolved.fixtureId,
    bookmaker_count: bookmakers.length,
    payload: oddsRes.data?.[0] ?? {},
  });

  const parsed = parseBookmakerPayload(bookmakers);
  const nowIso = new Date().toISOString();

  // 1) Reference 1X2 odds → matches.reference_odds (margin applied)
  if (parsed.ref) {
    const ref = match.margin_disabled
      ? await apply3WayMargin(parsed.ref, { applyMargin: false })
      : await apply3WayMargin(parsed.ref);
    await supabaseAdmin.from("match_odds_snapshots" as any).insert({
      match_id: match.id,
      source: "api-football",
      home_odds: ref.home,
      draw_odds: ref.draw,
      away_odds: ref.away,
      raw_bookmaker_count: bookmakers.length,
      sampled_at: nowIso,
    });
    await supabaseAdmin
      .from("matches")
      .update({
        reference_odds: ref,
        odds_updated_at: nowIso,
        odds_source: "api-football",
        updated_at: nowIso,
      } as any)
      .eq("id", match.id);
  }

  // 2) Real bookmaker prices replace seeded/fabricated odds in match_market_odds
  // Group by market so we apply per-market normalization (overround-strip + margin)
  const byMarket = new Map<string, ParsedOdds[]>();
  for (const o of parsed.odds) {
    const arr = byMarket.get(o.market) ?? [];
    arr.push(o);
    byMarket.set(o.market, arr);
  }

  let marketsWritten = 0;
  for (const [market, list] of byMarket) {
    const adjusted = match.margin_disabled ? list : await houseAdjust(market, list);
    for (const row of adjusted) {
      await supabaseAdmin.from("match_market_odds" as any).upsert(
        {
          match_id: match.id,
          market: row.market,
          selection: row.selection,
          odds: row.odds,
          active: true,
          source: "api-football",
          generated: false,
          updated_at: nowIso,
        },
        { onConflict: "match_id,market,selection" } as any,
      );
      marketsWritten++;
    }
    // Snapshot history (per market) for audit
    await supabaseAdmin.from("market_odds_snapshots" as any).insert(
      adjusted.map((r) => ({
        match_id: match.id,
        market: r.market,
        selection: r.selection,
        odds: r.odds,
        source: "api-football",
        sampled_at: nowIso,
      })),
    );
  }

  await supabaseAdmin.from("audit_log").insert({
    user_id: null,
    action: "apifootball.sync",
    entity: "matches",
    entity_id: match.id,
    metadata: {
      fixture_id: resolved.fixtureId,
      bookmakers: bookmakers.length,
      markets_written: marketsWritten,
      quota_remaining: oddsRes.quota.remaining,
    },
  });

  return {
    matchId: match.id,
    status: "ok",
    bookmakers: bookmakers.length,
    markets: marketsWritten,
    quotaSpent: resolved.quotaSpent + 1,
    quotaRemaining: oddsRes.quota.remaining,
  };
}

// Batch: pick scheduled matches with kickoff in the next N hours and refresh.
// Skips matches already refreshed within `freshnessHours`.
export async function syncUpcomingMatchOdds(opts: { hoursAhead?: number; freshnessHours?: number; maxMatches?: number } = {}) {
  const hoursAhead = opts.hoursAhead ?? 48;
  const freshnessHours = opts.freshnessHours ?? 6;
  const maxMatches = opts.maxMatches ?? 10;

  const horizon = new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();
  const stale = new Date(Date.now() - freshnessHours * 3600 * 1000).toISOString();

  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, kickoff_at, odds_source, odds_updated_at")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .lt("kickoff_at", horizon)
    .order("kickoff_at", { ascending: true })
    .limit(maxMatches * 3);

  const results: SyncResult[] = [];
  for (const m of matches ?? []) {
    const isStale =
      !(m as any).odds_updated_at ||
      (m as any).odds_source !== "api-football" ||
      (m as any).odds_updated_at < stale;
    if (!isStale) continue;
    const r = await syncMatchOddsApiFootball((m as any).id);
    results.push(r);
    if (r.status === "quota_exhausted") break;
    if (results.length >= maxMatches) break;
  }
  return { processed: results.length, results };
}
