// Server-only: pull live in-play 1X2 odds from API-Football and persist as
// match_odds_snapshots + reference_odds updates. Falls back to The Odds API
// for any live fixture API-Football doesn't cover.
//
// A single API-Football /odds/live call returns odds for every in-play fixture
// worldwide, so the cost is 1 request per poll regardless of how many matches
// are live simultaneously.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apiFootballGet } from "@/lib/apifootball.server";
import { apply3WayMargin } from "@/lib/odds-margin.server";

type LiveOddsRow = {
  fixture: { id: number };
  odds: Array<{
    id: number;
    name: string;
    values: Array<{ value: string; odd: string }>;
  }>;
};

// API-Football bet-id 1 = "Match Winner" (1X2 in-play). Some feeds also expose
// "Full Time Result" as id 59 or name variants; we accept either.
function extract1X2(row: LiveOddsRow): { home: number; draw: number; away: number } | null {
  const bet = row.odds?.find(
    (b) =>
      b.id === 1 ||
      /match\s*winner/i.test(b.name ?? "") ||
      /full\s*time\s*result/i.test(b.name ?? "") ||
      /^1x2$/i.test(b.name ?? ""),
  );
  if (!bet) return null;
  let home = 0, draw = 0, away = 0;
  for (const v of bet.values ?? []) {
    const odd = Number(v.odd);
    if (!Number.isFinite(odd) || odd < 1.001) continue;
    const label = String(v.value ?? "").trim().toLowerCase();
    if (label === "home" || label === "1") home = odd;
    else if (label === "draw" || label === "x") draw = odd;
    else if (label === "away" || label === "2") away = odd;
  }
  if (home && draw && away) return { home, draw, away };
  return null;
}

export type LiveOddsSyncResult = {
  ok: boolean;
  skipped?: string;
  processed?: number;
  updated?: number;
  fallbackAttempted?: number;
  quota?: any;
};

export async function runLiveOddsSync(): Promise<LiveOddsSyncResult> {
  const now = new Date();
  const start = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();

  const { data: live } = await (supabaseAdmin as any)
    .from("matches")
    .select("id, apifootball_fixture_id, home_team, away_team, margin_disabled, kickoff_at")
    .neq("status", "finished")
    .gt("kickoff_at", start)
    .lt("kickoff_at", now.toISOString());

  if (!live?.length) return { ok: true, skipped: "no live fixtures" };

  const fixtureIds = new Set<number>(
    (live as any[]).map((m) => Number(m.apifootball_fixture_id)).filter((n) => Number.isFinite(n) && n > 0),
  );

  // Single global call — 1 quota unit.
  const resp = await apiFootballGet<LiveOddsRow[]>(`/odds/live`);
  const rowsByFixture = new Map<number, LiveOddsRow>();
  if (!("skipped" in resp)) {
    for (const r of resp.data ?? []) {
      const fid = Number(r?.fixture?.id);
      if (Number.isFinite(fid)) rowsByFixture.set(fid, r);
    }
  }

  let updated = 0;
  let fallbackAttempted = 0;
  const nowIso = new Date().toISOString();

  for (const m of live as any[]) {
    const fid = Number(m.apifootball_fixture_id);
    const row = Number.isFinite(fid) ? rowsByFixture.get(fid) : undefined;
    const raw = row ? extract1X2(row) : null;

    if (!raw) {
      // Fallback to The Odds API for just this fixture — narrow use only.
      fallbackAttempted++;
      const fallback = await fetchFallbackOdds(m.home_team, m.away_team, m.kickoff_at);
      if (!fallback) continue;
      await persistOdds(m, fallback, nowIso, "the-odds-api-live");
      updated++;
      continue;
    }

    await persistOdds(m, raw, nowIso, "api-football-live");
    updated++;
  }

  await (supabaseAdmin as any).from("audit_log").insert({
    user_id: null,
    action: "odds.live_sync",
    entity: "matches",
    entity_id: null,
    metadata: { updated, live_count: live.length, fallback_attempted: fallbackAttempted },
  });

  return {
    ok: true,
    processed: live.length,
    updated,
    fallbackAttempted,
    quota: "quota" in resp ? resp.quota : undefined,
  };
}

async function persistOdds(
  match: { id: string; margin_disabled?: boolean | null },
  raw: { home: number; draw: number; away: number },
  nowIso: string,
  source: string,
) {
  const reference_odds = match.margin_disabled
    ? await apply3WayMargin(raw, { applyMargin: false })
    : await apply3WayMargin(raw);

  await (supabaseAdmin as any).from("match_odds_snapshots").insert({
    match_id: match.id,
    source,
    home_odds: reference_odds.home,
    draw_odds: reference_odds.draw,
    away_odds: reference_odds.away,
    raw_bookmaker_count: null,
    sampled_at: nowIso,
  });

  await (supabaseAdmin as any)
    .from("matches")
    .update({
      reference_odds,
      odds_updated_at: nowIso,
      odds_source: source,
      updated_at: nowIso,
    })
    .eq("id", match.id);

  try {
    await (supabaseAdmin as any).rpc("regenerate_match_market_odds", { p_match_id: match.id });
  } catch (e) {
    console.log(`[odds-live] regenerate markets failed for ${match.id}: ${(e as Error).message}`);
  }
}

// Narrow fallback: single Odds API call, filtered to the one fixture we need.
// Only invoked when API-Football has no live line for a match — so it stays
// well within the 20K/month budget even at 15s cadence.
async function fetchFallbackOdds(
  homeTeam: string,
  awayTeam: string,
  kickoffIso: string,
): Promise<{ home: number; draw: number; away: number } | null> {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return null;

  const url =
    "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds" +
    `?regions=eu&markets=h2h&oddsFormat=decimal&apiKey=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const events = (await res.json()) as any[];

  const norm = (s: string) =>
    (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  const ko = new Date(kickoffIso).getTime();

  const ev = events.find((e: any) => {
    const eh = norm(e.home_team);
    const ea = norm(e.away_team);
    if (!((eh === h && ea === a) || (eh === a && ea === h))) return false;
    const ekt = new Date(e.commence_time).getTime();
    return Math.abs(ekt - ko) < 6 * 60 * 60 * 1000;
  });
  if (!ev) return null;

  const homePrices: number[] = [], drawPrices: number[] = [], awayPrices: number[] = [];
  for (const bm of ev.bookmakers ?? []) {
    const market = (bm.markets ?? []).find((mk: any) => mk.key === "h2h");
    if (!market) continue;
    for (const o of market.outcomes ?? []) {
      const n = norm(o.name);
      if (n === norm(ev.home_team)) homePrices.push(o.price);
      else if (n === norm(ev.away_team)) awayPrices.push(o.price);
      else if (n === "draw") drawPrices.push(o.price);
    }
  }
  if (!homePrices.length || !awayPrices.length || !drawPrices.length) return null;
  const median = (nums: number[]) => {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  return {
    home: Number(median(homePrices).toFixed(2)),
    draw: Number(median(drawPrices).toFixed(2)),
    away: Number(median(awayPrices).toFixed(2)),
  };
}
