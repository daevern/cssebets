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

export type SeededF1Top5 = {
  raceId: string;
  marketId: string;
  driverKey: string;
  odds: number;
};

export async function seedF1Top5(overrides: Partial<SeededF1Top5> = {}): Promise<SeededF1Top5> {
  const sb = adminClient();
  const raceId = overrides.raceId ?? randomUUID();
  const marketId = overrides.marketId ?? randomUUID();
  const driverKey = overrides.driverKey ?? "e2e_driver";
  const odds = overrides.odds ?? 2.1;
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const raceKey = `e2e_${raceId.replace(/-/g, "").slice(0, 12)}`;

  await sb.from("f1_drivers").upsert(
    {
      driver_key: driverKey,
      name: "E2E Driver",
      abbr: "E2E",
      active: true,
    },
    { onConflict: "driver_key" },
  );

  const { error: raceErr } = await sb.from("f1_races").insert({
    id: raceId,
    race_key: raceKey,
    season: new Date().getUTCFullYear(),
    round: 99,
    name: "E2E Grand Prix",
    starts_at: startsAt,
    status: "scheduled",
    provider_id: null,
    settled_at: null,
    results: null,
  });
  if (raceErr) throw new Error(`seed f1_races: ${raceErr.message}`);

  const { error: mktErr } = await sb.from("f1_race_markets").insert({
    id: marketId,
    race_id: raceId,
    market_type: "top_5_finish",
    selection_key: driverKey,
    label: "E2E Driver",
    odds,
    status: "open",
  });
  if (mktErr) throw new Error(`seed f1_race_markets: ${mktErr.message}`);

  return { raceId, marketId, driverKey, odds };
}

/** Seed results + move start into the past so cron settle can grade without a live API. */
export async function finishF1RaceWithSeededResults(raceId: string, winnerDriverKey: string) {
  const sb = adminClient();
  const past = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  const { error } = await sb
    .from("f1_races")
    .update({
      starts_at: past,
      results: [
        {
          position: 1,
          points: 25,
          driver: { name: "E2E Driver", key: winnerDriverKey },
          team: { name: "E2E Team" },
        },
      ],
    })
    .eq("id", raceId);
  if (error) throw new Error(`finish f1_races: ${error.message}`);
}

export async function latestF1Bet(raceId: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from("f1_bets")
    .select("id, user_id, status, stake, odds_locked, potential_payout, selection_key, market_type")
    .eq("race_id", raceId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`f1_bets: ${error.message}`);
  return data;
}

export async function cleanupF1Seed(raceId: string, marketId: string) {
  const sb = adminClient();
  await sb.from("f1_bets").delete().eq("race_id", raceId);
  await sb.from("f1_race_markets").delete().eq("id", marketId);
  await sb.from("f1_races").delete().eq("id", raceId);
}

export type SeededUfcMoneyline = {
  eventId: string;
  fightId: string;
  oddsA: number;
  oddsB: number;
};

export async function seedUfcMoneyline(
  overrides: Partial<SeededUfcMoneyline> = {},
): Promise<SeededUfcMoneyline> {
  const sb = adminClient();
  const eventId = overrides.eventId ?? randomUUID();
  const fightId = overrides.fightId ?? randomUUID();
  const oddsA = overrides.oddsA ?? 2.1;
  const oddsB = overrides.oddsB ?? 1.8;
  const startsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { error: evErr } = await sb.from("ufc_events").insert({
    id: eventId,
    event_key: `e2e_ufc_${eventId.replace(/-/g, "").slice(0, 12)}`,
    name: "E2E UFC Card",
    starts_at: startsAt,
    is_active: true,
  });
  if (evErr) throw new Error(`seed ufc_events: ${evErr.message}`);

  const { error: fightErr } = await sb.from("ufc_fights").insert({
    id: fightId,
    event_id: eventId,
    fighter_a: "E2E Alpha",
    fighter_b: "E2E Bravo",
    commence_time: startsAt,
    card_position: "main",
    scheduled_rounds: 3,
    status: "scheduled",
    winner: null,
    settled_at: null,
  });
  if (fightErr) throw new Error(`seed ufc_fights: ${fightErr.message}`);

  const { error: mktErr } = await sb.from("ufc_fight_markets").insert([
    {
      fight_id: fightId,
      market_type: "moneyline",
      selection_key: "a",
      label: "E2E Alpha",
      odds: oddsA,
      is_active: true,
    },
    {
      fight_id: fightId,
      market_type: "moneyline",
      selection_key: "b",
      label: "E2E Bravo",
      odds: oddsB,
      is_active: true,
    },
  ]);
  if (mktErr) throw new Error(`seed ufc_fight_markets: ${mktErr.message}`);

  return { eventId, fightId, oddsA, oddsB };
}

/** Deterministic moneyline settle via RPC (no live MMA feed). */
export async function settleUfcFightWinner(fightId: string, winner: "a" | "b" | "draw") {
  const sb = adminClient();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await sb.from("ufc_fights").update({ commence_time: past }).eq("id", fightId);
  const { error } = await sb.rpc("auto_settle_ufc_winner_atomic", {
    p_fight_id: fightId,
    p_winner: winner,
  });
  if (error) throw new Error(`auto_settle_ufc_winner_atomic: ${error.message}`);
}

export async function latestUfcBet(fightId: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from("ufc_bets")
    .select("id, user_id, status, stake, odds_locked, potential_payout, payout, selection_key, market_type")
    .eq("fight_id", fightId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`ufc_bets: ${error.message}`);
  return data;
}

export async function cleanupUfcSeed(eventId: string, fightId: string) {
  const sb = adminClient();
  await sb.from("ufc_bets").delete().eq("fight_id", fightId);
  await sb.from("ufc_fight_markets").delete().eq("fight_id", fightId);
  await sb.from("ufc_fights").delete().eq("id", fightId);
  await sb.from("ufc_events").delete().eq("id", eventId);
}

/** Look up auth.users id by email (service role). */
export async function findAuthUserIdByEmail(email: string): Promise<string> {
  const sb = adminClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const user = (data.users ?? []).find((u) => (u.email ?? "").toLowerCase() === normalized);
  if (!user) throw new Error(`No auth user for ${email}`);
  return user.id;
}

/** Mirror admin approveUser: pending → member, clear simulation flags. */
export async function approveUserAsAdmin(userId: string) {
  const sb = adminClient();
  await sb.from("user_roles").delete().eq("user_id", userId).eq("role", "pending");
  const { error } = await sb.from("user_roles").upsert(
    { user_id: userId, role: "member" },
    { onConflict: "user_id,role" },
  );
  if (error) throw new Error(`approve member role: ${error.message}`);
  await sb.from("profiles").update({ is_simulation: false }).eq("id", userId);
  await sb.from("wallets").update({ is_simulation: false }).eq("user_id", userId);
}

export async function userHasRole(userId: string, role: string): Promise<boolean> {
  const sb = adminClient();
  const { data, error } = await sb
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();
  if (error) throw new Error(`user_roles: ${error.message}`);
  return Boolean(data);
}

export type SeededFootballBtts = {
  eventId: string;
  marketId: string;
  yesOdds: number;
  noOdds: number;
};

/** Seed a bettable EPL BTTS market (yes/no). */
export async function seedFootballBtts(
  overrides: Partial<SeededFootballBtts> = {},
): Promise<SeededFootballBtts> {
  const sb = adminClient();
  const eventId = overrides.eventId ?? randomUUID();
  const marketId = overrides.marketId ?? randomUUID();
  const yesOdds = overrides.yesOdds ?? 1.9;
  const noOdds = overrides.noOdds ?? 1.9;
  const kickoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const { error: eventErr } = await sb.from("sports_events").insert({
    id: eventId,
    sport_code: "football",
    competition_code: "EPL",
    scheduled_at: kickoff,
    status: "scheduled",
    home_name: "E2E BTTS Home",
    away_name: "E2E BTTS Away",
    markets_open: true,
    is_enabled: true,
  });
  if (eventErr) throw new Error(`seed sports_events: ${eventErr.message}`);

  const { error: marketErr } = await sb.from("sports_markets").insert({
    id: marketId,
    sports_event_id: eventId,
    market_key: "btts",
    display_name: "Both Teams to Score",
    category: "Goals",
    period: "full",
    status: "open",
    sort_order: 20,
    last_odds_update_at: new Date().toISOString(),
  });
  if (marketErr) throw new Error(`seed sports_markets: ${marketErr.message}`);

  const { error: selErr } = await sb.from("sports_market_selections").insert([
    {
      sports_market_id: marketId,
      selection_key: "yes",
      display_name: "Yes",
      decimal_odds: yesOdds,
      sort_order: 1,
      status: "open",
    },
    {
      sports_market_id: marketId,
      selection_key: "no",
      display_name: "No",
      decimal_odds: noOdds,
      sort_order: 2,
      status: "open",
    },
  ]);
  if (selErr) throw new Error(`seed sports_market_selections: ${selErr.message}`);

  await sb.from("sports_feature_flags").upsert(
    [
      { key: "football_enabled", enabled: true },
      { key: "epl_enabled", enabled: true },
    ],
    { onConflict: "key" },
  );

  return { eventId, marketId, yesOdds, noOdds };
}

export type SeededWcMatch1x2 = {
  matchId: string;
  homeOdds: number;
  drawOdds: number;
  awayOdds: number;
};

/** Seed a World Cup `matches` row with 1x2 reference odds. */
export async function seedWcMatch1x2(
  overrides: Partial<SeededWcMatch1x2> = {},
): Promise<SeededWcMatch1x2> {
  const sb = adminClient();
  const matchId = overrides.matchId ?? randomUUID();
  const homeOdds = overrides.homeOdds ?? 2.1;
  const drawOdds = overrides.drawOdds ?? 3.2;
  const awayOdds = overrides.awayOdds ?? 3.5;
  const kickoff = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const row: Record<string, unknown> = {
    id: matchId,
    home_team: "E2E WC Home",
    away_team: "E2E WC Away",
    kickoff_at: kickoff,
    status: "scheduled",
    reference_odds: { home: homeOdds, draw: drawOdds, away: awayOdds },
    is_simulation: true,
    odds_status: "ok",
    odds_updated_at: new Date().toISOString(),
  };

  // `markets_open` exists on sports_events; try it on matches only if present.
  const withOpen = { ...row, markets_open: true };
  let { error } = await sb.from("matches").insert(withOpen);
  if (error && /markets_open/i.test(error.message)) {
    ({ error } = await sb.from("matches").insert(row));
  }
  if (error) throw new Error(`seed matches: ${error.message}`);

  return { matchId, homeOdds, drawOdds, awayOdds };
}

/**
 * Place a WC 1x2 prediction via `place_bet_atomic` (service role).
 * `outcome` is HOME | DRAW | AWAY.
 */
export async function placeWcPredictionViaRpc(
  userId: string,
  matchId: string,
  outcome: "HOME" | "DRAW" | "AWAY",
  stake: number,
  odds: number,
) {
  const sb = adminClient();
  const { data, error } = await sb.rpc("place_bet_atomic", {
    p_user_id: userId,
    p_match_id: matchId,
    p_market: "result",
    p_outcome: outcome,
    p_odds: odds,
    p_stake: stake,
    p_client_request_id: randomUUID(),
  });
  if (error) throw new Error(`place_bet_atomic: ${error.message}`);
  return data as string;
}

export async function finishWcMatch(matchId: string, home: number, away: number) {
  const sb = adminClient();
  const { error } = await sb
    .from("matches")
    .update({
      status: "finished",
      home_score: home,
      away_score: away,
      finished_at: new Date().toISOString(),
    })
    .eq("id", matchId);
  if (error) throw new Error(`finish matches: ${error.message}`);
}

export async function settleWcMatch(matchId: string, home: number, away: number) {
  const sb = adminClient();
  const { error } = await sb.rpc("settle_match_all_markets_atomic", {
    p_match_id: matchId,
    p_home: home,
    p_away: away,
  });
  if (error) throw new Error(`settle_match_all_markets_atomic: ${error.message}`);
}

export async function latestPrediction(matchId: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from("predictions")
    .select(
      "id, user_id, status, outcome, points, potential_return, reference_odds, virtual_stake, market",
    )
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`predictions: ${error.message}`);
  return data;
}

export async function cleanupWcMatch(matchId: string) {
  const sb = adminClient();
  await sb.from("predictions").delete().eq("match_id", matchId);
  await sb.from("match_market_odds").delete().eq("match_id", matchId);
  await sb.from("match_odds_snapshots").delete().eq("match_id", matchId);
  await sb.from("matches").delete().eq("id", matchId);
}

export type SeededF1ChampDrivers = {
  season: number;
  marketIdA: string;
  marketIdB: string;
  keyA: string;
  keyB: string;
};

/** Upsert two open drivers' championship markets for an E2E season. */
export async function seedF1ChampionshipDrivers(
  season: number,
): Promise<SeededF1ChampDrivers> {
  const sb = adminClient();
  const keyA = "e2e_champ_a";
  const keyB = "e2e_champ_b";

  await sb.from("f1_drivers").upsert(
    [
      { driver_key: keyA, name: "E2E Champ A", abbr: "ECA", active: true },
      { driver_key: keyB, name: "E2E Champ B", abbr: "ECB", active: true },
    ],
    { onConflict: "driver_key" },
  );

  const { error } = await sb.from("f1_championship_markets").upsert(
    [
      {
        season,
        market_type: "drivers",
        selection_key: keyA,
        label: "E2E Champ A",
        odds: 2.0,
        status: "open",
        winning: null,
        settled_at: null,
      },
      {
        season,
        market_type: "drivers",
        selection_key: keyB,
        label: "E2E Champ B",
        odds: 3.0,
        status: "open",
        winning: null,
        settled_at: null,
      },
    ],
    { onConflict: "season,market_type,selection_key" },
  );
  if (error) throw new Error(`seed f1_championship_markets: ${error.message}`);

  // Force open in case upsert left a previously settled row untouched on null fields.
  await sb
    .from("f1_championship_markets")
    .update({ status: "open", winning: null, settled_at: null, odds: 2.0 })
    .eq("season", season)
    .eq("market_type", "drivers")
    .eq("selection_key", keyA);
  await sb
    .from("f1_championship_markets")
    .update({ status: "open", winning: null, settled_at: null, odds: 3.0 })
    .eq("season", season)
    .eq("market_type", "drivers")
    .eq("selection_key", keyB);

  const { data: rows, error: readErr } = await sb
    .from("f1_championship_markets")
    .select("id, selection_key")
    .eq("season", season)
    .eq("market_type", "drivers")
    .in("selection_key", [keyA, keyB]);
  if (readErr) throw new Error(`read f1_championship_markets: ${readErr.message}`);
  const a = (rows ?? []).find((r) => r.selection_key === keyA);
  const b = (rows ?? []).find((r) => r.selection_key === keyB);
  if (!a || !b) throw new Error("seeded F1 champ markets missing after upsert");

  return {
    season,
    marketIdA: a.id as string,
    marketIdB: b.id as string,
    keyA,
    keyB,
  };
}

export async function placeF1ChampBetViaRpc(
  userId: string,
  marketId: string,
  stake: number,
  maxOdds: number,
) {
  const sb = adminClient();
  const { data, error } = await sb.rpc("place_f1_championship_bet_atomic", {
    p_user_id: userId,
    p_market_id: marketId,
    p_stake: stake,
    p_max_odds: maxOdds,
  });
  if (error) throw new Error(`place_f1_championship_bet_atomic: ${error.message}`);
  return data as string;
}

export async function latestF1ChampBet(marketId: string) {
  const sb = adminClient();
  const { data, error } = await sb
    .from("f1_championship_bets")
    .select(
      "id, user_id, status, stake, odds_locked, potential_payout, selection_key, market_id",
    )
    .eq("market_id", marketId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`f1_championship_bets: ${error.message}`);
  return data;
}

/**
 * Offline championship settle for E2E — mirrors settleF1ChampionshipSeason wallet path
 * without importing server-only settlement code.
 */
export async function settleF1ChampionshipOffline(season: number, winnerKey: string) {
  const sb = adminClient();
  const winner = winnerKey
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

  const { data: markets, error: mErr } = await sb
    .from("f1_championship_markets")
    .select("id, market_type, selection_key, status")
    .eq("season", season)
    .eq("status", "open");
  if (mErr) throw new Error(`list champ markets: ${mErr.message}`);

  let settled = 0;
  for (const m of markets ?? []) {
    if (m.market_type !== "drivers") continue;
    const winning = m.selection_key === winner;
    const { error: updM } = await sb
      .from("f1_championship_markets")
      .update({
        winning,
        status: "settled",
        settled_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    if (updM) throw new Error(`settle market: ${updM.message}`);
    settled++;

    const { data: bets, error: bErr } = await sb
      .from("f1_championship_bets")
      .select("id, user_id, stake, potential_payout, status")
      .eq("market_id", m.id)
      .eq("status", "open");
    if (bErr) throw new Error(`list champ bets: ${bErr.message}`);

    for (const bet of bets ?? []) {
      const newStatus = winning ? "won" : "lost";
      const { data: updated, error: betUpd } = await sb
        .from("f1_championship_bets")
        .update({ status: newStatus, settled_at: new Date().toISOString() })
        .eq("id", bet.id)
        .eq("status", "open")
        .select("id");
      if (betUpd) throw new Error(`champ bet settle: ${betUpd.message}`);
      if (winning && (updated?.length ?? 0) > 0) {
        const { error: walletError } = await sb.rpc("wallet_apply_change", {
          p_user_id: bet.user_id,
          p_type: "credit",
          p_amount: bet.potential_payout,
          p_reference_type: "bet_settlement",
          p_reference_id: bet.id,
          p_note: "F1 championship win payout",
          p_is_simulation: false,
        });
        if (walletError) throw new Error(`champ payout: ${walletError.message}`);
      }
    }
  }

  return { ok: true as const, settled, driverWinner: winner };
}

export async function cleanupF1Champ(season: number) {
  const sb = adminClient();
  const { data: markets } = await sb
    .from("f1_championship_markets")
    .select("id")
    .eq("season", season)
    .in("selection_key", ["e2e_champ_a", "e2e_champ_b"]);
  const ids = (markets ?? []).map((m) => m.id as string);
  if (ids.length) {
    await sb.from("f1_championship_bets").delete().in("market_id", ids);
    await sb.from("f1_championship_markets").delete().in("id", ids);
  }
}
