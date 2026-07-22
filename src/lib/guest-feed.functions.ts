import { createServerFn } from "@tanstack/react-start";

export type GuestFootballMatch = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string;
  stage: string | null;
  homeOdds: number | null;
  drawOdds: number | null;
  awayOdds: number | null;
  status: string;
};

export type GuestF1Race = {
  id: string;
  round: number;
  name: string;
  circuit: string | null;
  country: string | null;
  starts_at: string;
  status: string;
  topDriver: { name: string; odds: number } | null;
};

export type GuestUfcFight = {
  id: string;
  eventName: string | null;
  card: string | null;
  weight: string | null;
  starts_at: string;
  fighterA: { name: string; photo: string | null; country: string | null; odds: number | null };
  fighterB: { name: string; photo: string | null; country: string | null; odds: number | null };
};

export const getGuestFeed = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    football: GuestFootballMatch[];
    f1: GuestF1Race[];
    ufc: GuestUfcFight[];
  }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb = supabaseAdmin as any;
    const nowIso = new Date().toISOString();
    const liveWindowIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();

    const [footballScheduled, footballLive, f1Rows, ufcRows] = await Promise.all([
      sb.from("matches")
        .select("id, home_team, away_team, kickoff_at, reference_odds, status, stage")
        .gte("kickoff_at", nowIso)
        .in("status", ["scheduled"])
        .order("kickoff_at", { ascending: true })
        .limit(24),
      sb.from("matches")
        .select("id, home_team, away_team, kickoff_at, reference_odds, status, stage")
        .in("status", ["live"])
        .gte("kickoff_at", liveWindowIso)
        .order("kickoff_at", { ascending: true }),
      sb.from("f1_races")
        .select("id, round, name, circuit, country, starts_at, status, season")
        .in("status", ["scheduled", "in_progress"])
        .order("starts_at", { ascending: true })
        .limit(12),
      sb.from("ufc_fights")
        .select("id, event_name, card_position, weight_class, commence_time, status, fighter_a_name, fighter_b_name, fighter_a_photo, fighter_b_photo, fighter_a_country, fighter_b_country, fighter_a_odds, fighter_b_odds")
        .gte("commence_time", liveWindowIso)
        .in("card_position", ["main", "co_main"])
        .in("status", ["scheduled", "live"])
        .order("commence_time", { ascending: true })
        .limit(20),
    ]);

    const isTbd = (s: string | null | undefined) =>
      !s || String(s).trim().toUpperCase() === "TBD";

    const football: GuestFootballMatch[] = [
      ...(footballLive.data ?? []),
      ...(footballScheduled.data ?? []),
    ]
      .filter((m: any) => !(isTbd(m.home_team) && isTbd(m.away_team)))
      .slice(0, 18)
      .map((m: any) => {
        const r = m.reference_odds ?? {};
        return {
          id: m.id,
          homeTeam: m.home_team,
          awayTeam: m.away_team,
          kickoffAt: m.kickoff_at,
          stage: m.stage ?? null,
          status: m.status,
          homeOdds: r.home != null ? Number(r.home) : null,
          drawOdds: r.draw != null ? Number(r.draw) : null,
          awayOdds: r.away != null ? Number(r.away) : null,
        };
      });

    // For each F1 race, find lowest-odds race_winner market
    const raceIds = (f1Rows.data ?? []).map((r: any) => r.id);
    let topByRace = new Map<string, { name: string; odds: number }>();
    if (raceIds.length) {
      const { data: mkts } = await sb
        .from("f1_race_markets")
        .select("race_id, selection_key, label, odds")
        .in("race_id", raceIds)
        .eq("market_type", "race_winner")
        .eq("status", "open")
        .order("odds", { ascending: true });
      for (const m of mkts ?? []) {
        if (!topByRace.has(m.race_id)) {
          topByRace.set(m.race_id, { name: m.label ?? m.selection_key, odds: Number(m.odds) });
        }
      }
    }
    const f1: GuestF1Race[] = (f1Rows.data ?? []).map((r: any) => ({
      id: r.id,
      round: r.round,
      name: r.name,
      circuit: r.circuit,
      country: r.country,
      starts_at: r.starts_at,
      status: r.status,
      topDriver: topByRace.get(r.id) ?? null,
    }));

    const ufc: GuestUfcFight[] = (ufcRows.data ?? []).map((f: any) => ({
      id: f.id,
      eventName: f.event_name ?? null,
      card: f.card_position ?? null,
      weight: f.weight_class ?? null,
      starts_at: f.commence_time,
      fighterA: {
        name: f.fighter_a_name,
        photo: f.fighter_a_photo,
        country: f.fighter_a_country,
        odds: f.fighter_a_odds != null ? Number(f.fighter_a_odds) : null,
      },
      fighterB: {
        name: f.fighter_b_name,
        photo: f.fighter_b_photo,
        country: f.fighter_b_country,
        odds: f.fighter_b_odds != null ? Number(f.fighter_b_odds) : null,
      },
    }));

    return { football, f1, ufc };
  },
);
