// The Odds API integration. Server-only.
// Free tier: 500 requests/month. We throttle to once every 2 hours.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { apply3WayMargin } from "./odds-margin.server";

const THROTTLE_MS = 2 * 60 * 60 * 1000; // 2 hours
const ENDPOINT =
  "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds" +
  "?regions=eu&markets=h2h&oddsFormat=decimal";

// Aliases handle cases where football-data.org and The Odds API spell
// the same nation differently (e.g. "Czechia" vs "Czech Republic").
const TEAM_ALIASES: Record<string, string> = {
  czechia: "czechrepublic",
  czechrep: "czechrepublic",
  unitedstates: "usa",
  unitedstatesofamerica: "usa",
  us: "usa",
  southkorea: "korearepublic",
  korea: "korearepublic",
  republicofkorea: "korearepublic",
  northkorea: "koreadprrepublic",
  ivorycoast: "cotedivoire",
  cotedivoire: "cotedivoire",
  capeverde: "caboverde",
  capeverdeislands: "caboverde",
  caboverdeislands: "caboverde",
  cpv: "caboverde",
  curacao: "curacao",
  bosniaherzegovina: "bosniaandherzegovina",
  bosnia: "bosniaandherzegovina",
  drcongo: "congodr",
  congodr: "congodr",
  congodemocraticrepublic: "congodr",
  democraticrepublicofcongo: "congodr",
};

function normalize(name: string) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return TEAM_ALIASES[base] ?? base;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type OddsEvent = {
  id: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: Array<{
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number }>;
    }>;
  }>;
};

export async function runOddsSync(opts: { force?: boolean } = {}) {
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) {
    return { updated: 0, skipped: true, reason: "ODDS_API_KEY not set" };
  }

  // Throttle: check most recent odds_updated_at
  if (!opts.force) {
    const { data: last } = await supabaseAdmin
      .from("matches")
      .select("odds_updated_at")
      .eq("odds_source", "the-odds-api")
      .order("odds_updated_at", { ascending: false, nullsFirst: false } as any)
      .limit(1)
      .maybeSingle();
    const lastAt = (last as any)?.odds_updated_at
      ? new Date((last as any).odds_updated_at).getTime()
      : 0;
    // Bypass throttle if any upcoming match still has no odds — those matches
    // would otherwise stay on placeholder reference odds until the next window.
    const { count: missingCount } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .is("odds_updated_at", null)
      .gt("kickoff_at", new Date().toISOString());
    const hasMissing = (missingCount ?? 0) > 0;
    if (lastAt && Date.now() - lastAt < THROTTLE_MS && !hasMissing) {
      return { updated: 0, skipped: true, reason: "throttled" };
    }
  }


  const res = await fetch(`${ENDPOINT}&apiKey=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    console.log(`[odds-api] status=${res.status} body=${body.slice(0, 300)}`);
    return { updated: 0, skipped: true, reason: `odds-api ${res.status}` };
  }
  const events = (await res.json()) as OddsEvent[];

  // Pull scheduled matches still ahead of kickoff
  const { data: matches } = await supabaseAdmin
    .from("matches")
    .select("id, home_team, away_team, kickoff_at, status, margin_disabled")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString());

  let updated = 0;
  for (const m of matches ?? []) {
    const h = normalize(m.home_team);
    const a = normalize(m.away_team);
    const ko = new Date(m.kickoff_at).getTime();

    const ev = events.find((e) => {
      const eh = normalize(e.home_team);
      const ea = normalize(e.away_team);
      if (!(eh === h && ea === a) && !(eh === a && ea === h)) return false;
      const ekt = new Date(e.commence_time).getTime();
      return Math.abs(ekt - ko) < 6 * 60 * 60 * 1000; // within 6h
    });
    if (!ev) continue;

    const homePrices: number[] = [];
    const drawPrices: number[] = [];
    const awayPrices: number[] = [];
    for (const bm of ev.bookmakers) {
      const market = bm.markets.find((mk) => mk.key === "h2h");
      if (!market) continue;
      for (const o of market.outcomes) {
        const n = normalize(o.name);
        if (n === normalize(ev.home_team)) homePrices.push(o.price);
        else if (n === normalize(ev.away_team)) awayPrices.push(o.price);
        else if (n === "draw") drawPrices.push(o.price);
      }
    }
    if (!homePrices.length || !awayPrices.length || !drawPrices.length) continue;

    const rawOdds = {
      home: Number(median(homePrices).toFixed(2)),
      draw: Number(median(drawPrices).toFixed(2)),
      away: Number(median(awayPrices).toFixed(2)),
    };
    // Apply house margin (configurable via platform_settings) before persisting.
    const reference_odds = await apply3WayMargin(rawOdds);

    const nowIso = new Date().toISOString();

    // Write a snapshot row for audit/history (every sync, full history).
    await supabaseAdmin.from("match_odds_snapshots").insert({
      match_id: m.id,
      source: "the-odds-api",
      home_odds: reference_odds.home,
      draw_odds: reference_odds.draw,
      away_odds: reference_odds.away,
      raw_bookmaker_count: ev.bookmakers?.length ?? null,
      sampled_at: nowIso,
    });

    await supabaseAdmin
      .from("matches")
      .update({
        reference_odds,
        odds_updated_at: nowIso,
        odds_source: "the-odds-api",
        updated_at: nowIso,
      } as any)
      .eq("id", m.id);

    // Recompute all derived markets (O/U, BTTS, correct score, HT/FT, exact goals)
    // from the freshly-updated API h2h odds.
    try {
      await (supabaseAdmin as any).rpc("regenerate_match_market_odds", { p_match_id: m.id });
    } catch (e) {
      console.log(`[odds-api] regenerate markets failed for ${m.id}: ${(e as Error).message}`);
    }
    updated++;
  }

  await supabaseAdmin.from("audit_log").insert({
    user_id: null,
    action: "odds.sync",
    entity: "matches",
    entity_id: null,
    metadata: { updated, events: events.length, matches: matches?.length ?? 0 },
  });

  return { updated, skipped: false, events: events.length };
}
