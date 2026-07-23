import { createServerFn } from "@tanstack/react-start";

export type NextRaceDriver = {
  driver_key: string;
  name: string;
  abbr: string | null;
  team: string | null;
  photo_url: string | null;
  odds: number;
  pct: number;
};

export type NextF1Race = {
  id: string;
  name: string;
  circuit: string | null;
  country: string | null;
  starts_at: string;
  round: number | null;
  season: number | null;
  topDrivers: NextRaceDriver[];
} | null;


export type NextUfcFight = {
  id: string;
  fighter_a: string;
  fighter_b: string;
  fighter_a_logo: string | null;
  fighter_b_logo: string | null;
  commence_time: string;
  card_position: string | null;
  weight_class: string | null;
  is_title_fight: boolean | null;
  event_name: string | null;
  odds_a: number | null;
  odds_b: number | null;
} | null;

export type NextBonusMatch = {
  id: string;
  competition_code: string;
  competition_name: string;
  home_name: string;
  away_name: string;
  home_logo: string | null;
  away_logo: string | null;
  kickoff_at: string;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
} | null;

export const getDashboardMotorAndUfc = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    nextRace: NextF1Race;
    nextFight: NextUfcFight;
    nextBonusMatch: NextBonusMatch;
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();

    const [raceRes, eventRes] = await Promise.all([
      (supabaseAdmin as any)
        .from("f1_races")
        .select("id, name, circuit, country, starts_at, round, season, status")
        .gte("starts_at", nowIso)
        .in("status", ["scheduled", "in_progress"])
        .order("starts_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
      (supabaseAdmin as any)
        .from("ufc_events")
        .select("id, name, starts_at, is_active")
        .eq("is_active", true)
        .order("starts_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const race = raceRes?.data ?? null;

    let topDrivers: NextRaceDriver[] = [];
    if (race) {
      const { data: winnerMarkets } = await (supabaseAdmin as any)
        .from("f1_race_markets")
        .select("selection_key, odds, status")
        .eq("race_id", race.id)
        .eq("market_type", "race_winner")
        .eq("status", "open")
        .order("odds", { ascending: true })
        .limit(3);
      const keys = (winnerMarkets ?? []).map((m: any) => m.selection_key);
      let driversByKey: Record<string, { name: string; abbr: string | null; team_key: string | null; photo_url: string | null }> = {};
      let teamsByKey: Record<string, string> = {};
      if (keys.length) {
        const { data: drivers } = await (supabaseAdmin as any)
          .from("f1_drivers")
          .select("driver_key, name, abbr, team_key, photo_url")
          .in("driver_key", keys);
        for (const d of drivers ?? []) driversByKey[d.driver_key] = d;
        const teamKeys = Array.from(new Set((drivers ?? []).map((d: any) => d.team_key).filter(Boolean)));
        if (teamKeys.length) {
          const { data: teams } = await (supabaseAdmin as any)
            .from("f1_constructors")
            .select("team_key, name")
            .in("team_key", teamKeys);
          for (const t of teams ?? []) teamsByKey[t.team_key] = t.name;
        }
      }
      const invSum = (winnerMarkets ?? []).reduce((s: number, m: any) => s + 1 / Number(m.odds), 0);
      topDrivers = (winnerMarkets ?? []).map((m: any) => {
        const d = driversByKey[m.selection_key];
        const odds = Number(m.odds);
        const pct = invSum > 0 ? Math.round((1 / odds / invSum) * 100) : 0;
        return {
          driver_key: m.selection_key,
          name: d?.name ?? m.selection_key,
          abbr: d?.abbr ?? null,
          team: d?.team_key ? teamsByKey[d.team_key] ?? null : null,
          photo_url: d?.photo_url ?? null,
          odds,
          pct,
        };
      });
    }


    let fight: NextUfcFight = null;
    const event = eventRes?.data ?? null;
    if (event) {
      const eventStartMs = new Date(event.starts_at).getTime();
      const windowStart = new Date(eventStartMs - 12 * 60 * 60 * 1000).toISOString();
      const windowEnd = new Date(eventStartMs + 24 * 60 * 60 * 1000).toISOString();
      const { data: fights } = await (supabaseAdmin as any)
        .from("ufc_fights")
        .select("id, fighter_a, fighter_b, fighter_a_logo, fighter_b_logo, commence_time, card_position, weight_class, is_title_fight, status")
        .eq("event_id", event.id)
        .gte("commence_time", windowStart)
        .lte("commence_time", windowEnd)
        .order("card_position", { ascending: true })
        .order("commence_time", { ascending: true });
      const upcoming = (fights ?? []).find((f: any) => f.status !== "finished") ?? (fights ?? [])[0] ?? null;
      if (upcoming) {
        const { data: markets } = await (supabaseAdmin as any)
          .from("ufc_fight_markets")
          .select("selection_key, odds, is_active")
          .eq("fight_id", upcoming.id)
          .eq("market_type", "moneyline")
          .eq("is_active", true);
        const oddsA = (markets ?? []).find((m: any) => m.selection_key === "a")?.odds ?? null;
        const oddsB = (markets ?? []).find((m: any) => m.selection_key === "b")?.odds ?? null;
        fight = {
          id: upcoming.id,
          fighter_a: upcoming.fighter_a,
          fighter_b: upcoming.fighter_b,
          fighter_a_logo: upcoming.fighter_a_logo ?? null,
          fighter_b_logo: upcoming.fighter_b_logo ?? null,
          commence_time: upcoming.commence_time,
          card_position: upcoming.card_position ?? null,
          weight_class: upcoming.weight_class ?? null,
          is_title_fight: upcoming.is_title_fight ?? null,
          event_name: event.name ?? null,
          odds_a: oddsA != null ? Number(oddsA) : null,
          odds_b: oddsB != null ? Number(oddsB) : null,
        };
      }
    }

    // ---------- Next bonus (MLS / Brasileirão) match ----------
    let nextBonusMatch: NextBonusMatch = null;
    const { data: bonusEv } = await (supabaseAdmin as any)
      .from("sports_events")
      .select("id, competition_code, home_name, away_name, home_logo, away_logo, scheduled_at, is_enabled, status")
      .eq("sport_code", "football")
      .in("competition_code", ["MLS", "BRA_A"])
      .eq("is_enabled", true)
      .in("status", ["scheduled", "live"])
      .gte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (bonusEv) {
      const { data: mkt } = await (supabaseAdmin as any)
        .from("sports_markets")
        .select("id, market_key, sports_market_selections(selection_key, decimal_odds)")
        .eq("sports_event_id", bonusEv.id)
        .eq("market_key", "match_result")
        .eq("status", "open")
        .maybeSingle();
      const sels: any[] = (mkt as any)?.sports_market_selections ?? [];
      const pick = (k: string) => {
        const s = sels.find((x) => x.selection_key === k);
        return s ? Number(s.decimal_odds) : null;
      };
      nextBonusMatch = {
        id: bonusEv.id,
        competition_code: bonusEv.competition_code,
        competition_name: bonusEv.competition_code === "MLS" ? "MLS" : "Brasileirão",
        home_name: bonusEv.home_name ?? "TBD",
        away_name: bonusEv.away_name ?? "TBD",
        home_logo: bonusEv.home_logo ?? null,
        away_logo: bonusEv.away_logo ?? null,
        kickoff_at: bonusEv.scheduled_at,
        odds_home: pick("home"),
        odds_draw: pick("draw"),
        odds_away: pick("away"),
      };
    }

    return {
      nextRace: race
        ? {
            id: race.id,
            name: race.name,
            circuit: race.circuit ?? null,
            country: race.country ?? null,
            starts_at: race.starts_at,
            round: race.round ?? null,
            season: race.season ?? null,
            topDrivers,
          }
        : null,
      nextFight: fight,
      nextBonusMatch,
    };
  },
);
