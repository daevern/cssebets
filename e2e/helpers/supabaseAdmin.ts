import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

function requireEnv(name: string): string {
  const v =
    process.env[name] ||
    (name === "SUPABASE_URL" ? process.env.VITE_SUPABASE_URL : undefined) ||
    (name === "SUPABASE_PUBLISHABLE_KEY"
      ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY
      : undefined);
  if (!v) throw new Error(`${name} is required for settle E2E helpers`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type SeededFootball1x2 = {
  eventId: string;
  marketId: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
};

/** Seed a bettable EPL 1x2 match far enough in the future to avoid stale-odds suspend. */
export async function seedFootball1x2(
  overrides: Partial<SeededFootball1x2> = {},
): Promise<SeededFootball1x2> {
  const sb = adminClient();
  const eventId = overrides.eventId ?? randomUUID();
  const marketId = overrides.marketId ?? randomUUID();
  const homeOdds = overrides.homeOdds ?? 2.1;
  const drawOdds = overrides.drawOdds ?? 3.4;
  const awayOdds = overrides.awayOdds ?? 3.5;

  const kickoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { error: eventErr } = await sb.from("sports_events").insert({
    id: eventId,
    sport_code: "football",
    competition_code: "EPL",
    scheduled_at: kickoff,
    status: "scheduled",
    home_name: "E2E Home",
    away_name: "E2E Away",
    markets_open: true,
    is_enabled: true,
  });
  if (eventErr) throw new Error(`seed sports_events: ${eventErr.message}`);

  const { error: marketErr } = await sb.from("sports_markets").insert({
    id: marketId,
    sports_event_id: eventId,
    market_key: "match_result",
    display_name: "Match Result",
    category: "Match",
    period: "full",
    status: "open",
    sort_order: 10,
    last_odds_update_at: new Date().toISOString(),
  });
  if (marketErr) throw new Error(`seed sports_markets: ${marketErr.message}`);

  const { error: selErr } = await sb.from("sports_market_selections").insert([
    {
      sports_market_id: marketId,
      selection_key: "home",
      display_name: "Home",
      decimal_odds: homeOdds,
      sort_order: 1,
      status: "open",
    },
    {
      sports_market_id: marketId,
      selection_key: "draw",
      display_name: "Draw",
      decimal_odds: drawOdds,
      sort_order: 2,
      status: "open",
    },
    {
      sports_market_id: marketId,
      selection_key: "away",
      display_name: "Away",
      decimal_odds: awayOdds,
      sort_order: 3,
      status: "open",
    },
  ]);
  if (selErr) throw new Error(`seed sports_market_selections: ${selErr.message}`);

  // Ensure club football is reachable in ephemeral CI DBs (seed defaults off).
  await sb.from("sports_feature_flags").upsert(
    [
      { key: "football_enabled", enabled: true },
      { key: "epl_enabled", enabled: true },
    ],
    { onConflict: "key" },
  );

  return { eventId, marketId, homeOdds, drawOdds, awayOdds };
}

export async function finishFootballEvent(
  eventId: string,
  homeScore: number,
  awayScore: number,
) {
  const sb = adminClient();
  const { error } = await sb
    .from("sports_events")
    .update({
      status: "finished",
      home_score: homeScore,
      away_score: awayScore,
    })
    .eq("id", eventId);
  if (error) throw new Error(`finish sports_events: ${error.message}`);
}

export async function getWalletBalance(userId: string): Promise<number> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`wallet: ${error.message}`);
  return Number(data?.balance ?? 0);
}

export async function latestSportsBet(eventId: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from("sports_bets")
    .select(
      "id, user_id, status, stake, accepted_odds, potential_payout, actual_payout, selection_key",
    )
    .eq("sports_event_id", eventId)
    .order("placed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`sports_bets: ${error.message}`);
  return data;
}

export async function cleanupFootballSeed(eventId: string, marketId: string) {
  const sb = adminClient();
  await sb.from("sports_settlement_runs").delete().eq("sports_event_id", eventId);
  await sb.from("sports_bets").delete().eq("sports_event_id", eventId);
  await sb.from("sports_market_selections").delete().eq("sports_market_id", marketId);
  await sb.from("sports_markets").delete().eq("id", marketId);
  await sb.from("sports_events").delete().eq("id", eventId);
}
