// Server-only: pull live in-play 1X2 odds from API-Football and persist as
// match_odds_snapshots (World Cup) + sports_odds_snapshots (club football).
// Falls back to The Odds API for any WC fixture API-Football doesn't cover.
//
// A single API-Football /odds/live call returns odds for every in-play fixture
// worldwide, so the cost is 1 request per poll regardless of how many matches
// are live simultaneously. That dense poll cadence is what makes the Kalshi-style
// MarketAnalyticsCard LIVE window move every minute/second.
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
  footballUpdated?: number;
  fallbackAttempted?: number;
  quota?: any;
};

export async function runLiveOddsSync(): Promise<LiveOddsSyncResult> {
  const now = new Date();
  const start = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const nowIso = now.toISOString();

  const [{ data: liveWc }, { data: liveFootball }] = await Promise.all([
    (supabaseAdmin as any)
      .from("matches")
      .select("id, apifootball_fixture_id, home_team, away_team, margin_disabled, kickoff_at")
      .neq("status", "finished")
      .gt("kickoff_at", start)
      .lt("kickoff_at", nowIso),
    (supabaseAdmin as any)
      .from("sports_events")
      .select("id, scheduled_at, status")
      .eq("sport_code", "football")
      .in("status", ["live", "in_play", "1H", "2H", "HT", "ET", "PEN", "BT"])
      .gt("scheduled_at", start)
      .lt("scheduled_at", nowIso),
  ]);

  // Also treat club fixtures that kicked off in the last 3h and aren't finished
  // as live — status strings vary by sync path.
  const { data: recentlyStarted } = await (supabaseAdmin as any)
    .from("sports_events")
    .select("id, scheduled_at, status")
    .eq("sport_code", "football")
    .neq("status", "finished")
    .neq("status", "postponed")
    .neq("status", "cancelled")
    .gt("scheduled_at", start)
    .lt("scheduled_at", nowIso);

  const footballById = new Map<string, any>();
  for (const e of [...(liveFootball ?? []), ...(recentlyStarted ?? [])] as any[]) {
    footballById.set(e.id, e);
  }
  const footballEvents = [...footballById.values()];

  if (!liveWc?.length && !footballEvents.length) {
    return { ok: true, skipped: "no live fixtures" };
  }

  // Resolve api-football fixture ids for club events.
  const footballIds = footballEvents.map((e) => e.id);
  const { data: mappings } = footballIds.length
    ? await (supabaseAdmin as any)
        .from("sports_event_provider_mappings")
        .select("sports_event_id, provider_event_id")
        .eq("provider", "api-football")
        .in("sports_event_id", footballIds)
    : { data: [] as any[] };

  const fixtureToFootball = new Map<number, string>();
  for (const m of (mappings ?? []) as any[]) {
    const fid = Number(m.provider_event_id);
    if (Number.isFinite(fid) && fid > 0) fixtureToFootball.set(fid, m.sports_event_id);
  }

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
  let footballUpdated = 0;
  let fallbackAttempted = 0;

  for (const m of (liveWc ?? []) as any[]) {
    const fid = Number(m.apifootball_fixture_id);
    const row = Number.isFinite(fid) ? rowsByFixture.get(fid) : undefined;
    const raw = row ? extract1X2(row) : null;

    if (!raw) {
      fallbackAttempted++;
      const fallback = await fetchFallbackOdds(m.home_team, m.away_team, m.kickoff_at);
      if (!fallback) continue;
      await persistWcOdds(m, fallback, nowIso, "the-odds-api-live");
      updated++;
      continue;
    }

    await persistWcOdds(m, raw, nowIso, "api-football-live");
    updated++;
  }

  for (const [fid, eventId] of fixtureToFootball) {
    const row = rowsByFixture.get(fid);
    const raw = row ? extract1X2(row) : null;
    if (!raw) continue;
    const ok = await persistFootballOdds(eventId, raw, nowIso);
    if (ok) footballUpdated++;
  }

  await (supabaseAdmin as any).from("audit_log").insert({
    user_id: null,
    action: "odds.live_sync",
    entity: "matches",
    entity_id: null,
    metadata: {
      updated,
      football_updated: footballUpdated,
      live_count: (liveWc ?? []).length,
      football_live_count: footballEvents.length,
      fallback_attempted: fallbackAttempted,
    },
  });

  const heartbeat = await runMarketHeartbeat(nowIso);

  return {
    ok: true,
    processed: (liveWc ?? []).length + footballEvents.length,
    updated,
    footballUpdated,
    fallbackAttempted,
    heartbeat,
    quota: "quota" in resp ? resp.quota : undefined,
  };
}

/**
 * Zero-quota heartbeat: for club-football, UFC and F1 events inside their
 * active window, append a snapshot point from the CURRENT stored market prices
 * whenever the newest snapshot is older than ~20s. Provider syncs still supply
 * real price moves (a goal / finish repriced by the book); the heartbeat keeps
 * the Kalshi LIVE chart advancing every tick instead of flat-lining between
 * provider polls, exactly like World Cup match_odds_snapshots.
 */
export async function runMarketHeartbeat(nowIso: string) {
  const now = Date.now();
  const from = new Date(now - 4 * 60 * 60 * 1000).toISOString();
  const to = new Date(now + 2 * 60 * 60 * 1000).toISOString();
  const staleMs = 20_000;
  const out = { football: 0, ufc: 0, f1: 0 };

  const fresh = (t: string | null | undefined) =>
    !!t && now - new Date(t).getTime() < staleMs;

  try {
    // ---- club football (sports_markets) ----
    const { data: events } = await (supabaseAdmin as any)
      .from("sports_events")
      .select("id")
      .eq("sport_code", "football")
      .not("status", "in", '("finished","postponed","cancelled")')
      .gt("scheduled_at", from)
      .lt("scheduled_at", to)
      .limit(40);

    for (const ev of (events ?? []) as any[]) {
      const { data: market } = await (supabaseAdmin as any)
        .from("sports_markets")
        .select("id, market_key, status, sports_market_selections (selection_key, decimal_odds)")
        .eq("sports_event_id", ev.id)
        .eq("market_key", "match_result")
        .maybeSingle();
      const sels = (market?.sports_market_selections ?? []).filter(
        (s: any) => Number(s.decimal_odds) > 1,
      );
      if (!market?.id || sels.length === 0) continue;

      const { data: last } = await (supabaseAdmin as any)
        .from("sports_odds_snapshots")
        .select("fetched_at")
        .eq("sports_market_id", market.id)
        .order("fetched_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fresh(last?.fetched_at)) continue;

      await (supabaseAdmin as any).from("sports_odds_snapshots").insert(
        sels.map((s: any) => ({
          sports_event_id: ev.id,
          sports_market_id: market.id,
          market_key: "match_result",
          selection_key: s.selection_key,
          provider: "heartbeat",
          decimal_odds: Number(s.decimal_odds),
          provider_ts: nowIso,
        })),
      );
      out.football++;
    }
  } catch (e) {
    console.log(`[heartbeat] football failed: ${(e as Error).message}`);
  }

  try {
    // ---- UFC (moneyline) ----
    const { data: fights } = await (supabaseAdmin as any)
      .from("ufc_fights")
      .select("id")
      .neq("status", "finished")
      .neq("status", "cancelled")
      .gt("commence_time", from)
      .lt("commence_time", to)
      .limit(30);

    for (const f of (fights ?? []) as any[]) {
      const { data: mk } = await (supabaseAdmin as any)
        .from("ufc_fight_markets")
        .select("selection_key, odds")
        .eq("fight_id", f.id)
        .eq("market_type", "moneyline")
        .eq("is_active", true);
      const rows = ((mk ?? []) as any[]).filter((m) => Number(m.odds) > 1);
      if (!rows.length) continue;

      const { data: last } = await (supabaseAdmin as any)
        .from("ufc_market_snapshots")
        .select("sampled_at")
        .eq("fight_id", f.id)
        .eq("market_type", "moneyline")
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fresh(last?.sampled_at)) continue;

      await (supabaseAdmin as any).from("ufc_market_snapshots").insert(
        rows.map((m) => ({
          fight_id: f.id,
          market_type: "moneyline",
          selection_key: m.selection_key,
          odds: Number(m.odds),
          sampled_at: nowIso,
        })),
      );
      out.ufc++;
    }
  } catch (e) {
    console.log(`[heartbeat] ufc failed: ${(e as Error).message}`);
  }

  try {
    // ---- F1 (race winner) ----
    const { data: races } = await (supabaseAdmin as any)
      .from("f1_races")
      .select("id")
      .neq("status", "finished")
      .gt("starts_at", from)
      .lt("starts_at", to)
      .limit(5);

    for (const r of (races ?? []) as any[]) {
      const { data: mk } = await (supabaseAdmin as any)
        .from("f1_race_markets")
        .select("id, odds")
        .eq("race_id", r.id)
        .eq("market_type", "race_winner")
        .eq("status", "open")
        .limit(30);
      const rows = ((mk ?? []) as any[]).filter((m) => Number(m.odds) > 1);
      if (!rows.length) continue;

      const { data: last } = await (supabaseAdmin as any)
        .from("f1_race_odds_snapshots")
        .select("snapshot_at")
        .in("market_id", rows.map((m) => m.id))
        .order("snapshot_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fresh(last?.snapshot_at)) continue;

      await (supabaseAdmin as any).from("f1_race_odds_snapshots").insert(
        rows.map((m) => ({ market_id: m.id, odds: Number(m.odds), snapshot_at: nowIso })),
      );
      out.f1++;
    }
  } catch (e) {
    console.log(`[heartbeat] f1 failed: ${(e as Error).message}`);
  }

  return out;
}


async function persistWcOdds(
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

/** Club football: always stamp provider_ts=now so each poll creates a graph point. */
async function persistFootballOdds(
  eventId: string,
  raw: { home: number; draw: number; away: number },
  nowIso: string,
): Promise<boolean> {
  const { data: market, error: mErr } = await (supabaseAdmin as any)
    .from("sports_markets")
    .upsert(
      {
        sports_event_id: eventId,
        market_key: "match_result",
        display_name: "Match Result",
        category: "Match",
        period: "full",
        line: null,
        provider: "api-football",
        status: "open",
        sort_order: 1,
        provider_odds_ts: nowIso,
        last_odds_update_at: nowIso,
        suspension_reason: null,
      },
      { onConflict: "sports_event_id,market_key,period,line" },
    )
    .select("id")
    .single();
  if (mErr || !market?.id) return false;
  const marketId = market.id as string;

  const sels = [
    { selection_key: "home", display_name: "Home", decimal_odds: raw.home, sort_order: 1 },
    { selection_key: "draw", display_name: "Draw", decimal_odds: raw.draw, sort_order: 2 },
    { selection_key: "away", display_name: "Away", decimal_odds: raw.away, sort_order: 3 },
  ];

  for (const sel of sels) {
    await (supabaseAdmin as any)
      .from("sports_market_selections")
      .upsert(
        {
          sports_market_id: marketId,
          selection_key: sel.selection_key,
          display_name: sel.display_name,
          line: null,
          decimal_odds: sel.decimal_odds,
          status: "open",
          sort_order: sel.sort_order,
        },
        { onConflict: "sports_market_id,selection_key" },
      );

    await (supabaseAdmin as any).from("sports_odds_snapshots").insert({
      sports_event_id: eventId,
      sports_market_id: marketId,
      market_key: "match_result",
      selection_key: sel.selection_key,
      provider: "api-football-live",
      decimal_odds: sel.decimal_odds,
      // Unique per poll so the Kalshi LIVE chart gets a new point every tick
      // (even when the price is flat), matching World Cup match_odds_snapshots.
      provider_ts: nowIso,
    });
  }
  return true;
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
