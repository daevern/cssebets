// Server-only: sync FIFA World Cup outright (tournament winner) odds
// from The Odds API into public.tournament_outrights.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ENDPOINT =
  "https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup_winner/odds" +
  "?regions=eu&markets=outrights&oddsFormat=decimal";

const THROTTLE_MS = 6 * 60 * 60 * 1000; // 6 hours

type OutrightEvent = {
  bookmakers: Array<{
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number }>;
    }>;
  }>;
};

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function runTournamentOddsSync(opts: { force?: boolean; tournamentKey?: string } = {}) {
  const tournamentKey = opts.tournamentKey ?? "world_cup_2026";
  const apiKey = process.env.ODDS_API_KEY?.trim();
  if (!apiKey) return { updated: 0, skipped: true, reason: "ODDS_API_KEY not set" };

  if (!opts.force) {
    const { data: latest } = await supabaseAdmin
      .from("tournament_outrights")
      .select("updated_at")
      .eq("tournament_key", tournamentKey)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastAt = (latest as any)?.updated_at ? new Date((latest as any).updated_at).getTime() : 0;
    if (lastAt && Date.now() - lastAt < THROTTLE_MS) {
      return { updated: 0, skipped: true, reason: "throttled" };
    }
  }

  const res = await fetch(`${ENDPOINT}&apiKey=${apiKey}`);
  if (!res.ok) {
    const body = await res.text();
    console.log(`[tournament-odds] status=${res.status} body=${body.slice(0, 300)}`);
    return { updated: 0, skipped: true, reason: `odds-api ${res.status}` };
  }
  const events = (await res.json()) as OutrightEvent[];

  // Aggregate per team across bookmakers, then take median.
  const teamPrices = new Map<string, number[]>();
  for (const ev of events) {
    for (const bm of ev.bookmakers ?? []) {
      const market = bm.markets?.find((m) => m.key === "outrights");
      if (!market) continue;
      for (const o of market.outcomes) {
        if (!o.name || typeof o.price !== "number" || o.price < 1) continue;
        const arr = teamPrices.get(o.name) ?? [];
        arr.push(o.price);
        teamPrices.set(o.name, arr);
      }
    }
  }

  let updated = 0;
  const nowIso = new Date().toISOString();
  for (const [team, prices] of teamPrices) {
    if (!prices.length) continue;
    const odds = Number(median(prices).toFixed(2));
    const { error } = await supabaseAdmin
      .from("tournament_outrights")
      .upsert(
        {
          tournament_key: tournamentKey,
          team,
          odds,
          source: "the-odds-api",
          updated_at: nowIso,
        } as any,
        { onConflict: "tournament_key,team" } as any,
      );
    if (!error) updated++;
  }

  await supabaseAdmin.from("audit_log").insert({
    user_id: null,
    action: "tournament_odds.sync",
    entity: "tournament_outrights",
    entity_id: null,
    metadata: { updated, teams: teamPrices.size, events: events.length },
  });

  return { updated, skipped: false, teams: teamPrices.size };
}
