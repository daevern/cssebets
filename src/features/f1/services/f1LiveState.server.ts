// Server-only: fetches live F1 race state from API-F1 and caches it in
// f1_live_race_state. Called on-demand by getF1LiveRaceState (with 25s TTL)
// and by the /api/public/hooks/f1-live cron for pre-warming.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchF1RaceResults,
  fetchF1FastestLap,
} from "../adapters/apiF1Adapter.server";

export async function refreshF1LiveRaceState(raceId: string) {
  const { data: race } = await (supabaseAdmin as any)
    .from("f1_races")
    .select("id, provider_id, status, starts_at")
    .eq("id", raceId)
    .maybeSingle();
  if (!race?.provider_id) return null;

  // Only fetch if race is live or recently started (within 4h window).
  const started = new Date(race.starts_at).getTime() <= Date.now();
  const withinWindow = Date.now() - new Date(race.starts_at).getTime() < 4 * 3600_000;
  if (!started || !withinWindow) return null;

  let standings: any[] = [];
  let fastest: any = null;
  try {
    const [res, fl] = await Promise.all([
      fetchF1RaceResults(race.provider_id),
      fetchF1FastestLap(race.provider_id).catch(() => []),
    ]);
    standings = (res ?? []).map((r) => ({
      position: r.position ?? null,
      driver_id: r.driver?.id,
      driver_name: r.driver?.name,
      driver_image: r.driver?.image,
      team_name: r.team?.name,
      grid: r.grid ?? null,
      laps: r.laps ?? null,
      pits: r.pits ?? null,
      gap: r.gap ?? null,
      time: r.time ?? null,
    }));
    const top = (fl ?? [])[0];
    if (top) fastest = { driver_name: top.driver?.name, time: (top as any).time ?? null };
  } catch (e) {
    // Best-effort — keep the previous cache row if the fetch failed.
    return null;
  }

  const lapCurrent = standings.reduce((m, s) => Math.max(m, Number(s.laps) || 0), 0) || null;

  const payload = {
    race_id: raceId,
    lap_current: lapCurrent,
    lap_total: null,
    race_status: race.status,
    fastest_lap: fastest,
    standings,
    fetched_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { data } = await (supabaseAdmin as any)
    .from("f1_live_race_state")
    .upsert(payload, { onConflict: "race_id" })
    .select("*")
    .maybeSingle();
  return data;
}
