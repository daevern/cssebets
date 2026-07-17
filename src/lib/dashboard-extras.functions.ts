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

export const getDashboardMotorAndUfc = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ nextRace: NextF1Race; nextFight: NextUfcFight }> => {
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
          }
        : null,
      nextFight: fight,
    };
  },
);
