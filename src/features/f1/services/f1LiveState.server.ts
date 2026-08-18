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

/**
 * Append open-market odds snapshots for near-term races only.
 * Skips rows whose odds are unchanged vs the latest sample (cuts disk IO).
 */
export async function sampleF1OpenMarketSnapshots(opts: {
  withinHours?: number;
} = {}): Promise<{ races: number; snapshots: number; skippedUnchanged: number }> {
  // Default 6h — was 72h and wrote millions of redundant rows.
  const withinHours = opts.withinHours ?? 6;
  const now = Date.now();
  const fromIso = new Date(now - 4 * 3600_000).toISOString();
  const toIso = new Date(now + withinHours * 3600_000).toISOString();

  const { data: races } = await (supabaseAdmin as any)
    .from("f1_races")
    .select("id")
    .gte("starts_at", fromIso)
    .lte("starts_at", toIso)
    .neq("status", "finished")
    .limit(8);

  let snapshots = 0;
  let skippedUnchanged = 0;
  for (const race of (races ?? []) as Array<{ id: string }>) {
    const { data: markets } = await (supabaseAdmin as any)
      .from("f1_race_markets")
      .select("id, odds, status")
      .eq("race_id", race.id)
      .eq("status", "open");
    const rows = ((markets ?? []) as Array<{ id: string; odds: number }>)
      .filter((m) => Number(m.odds) > 1)
      .map((m) => ({ market_id: m.id, odds: Number(m.odds) }));
    if (!rows.length) continue;

    const ids = rows.map((r) => r.market_id);
    const latestByMarket = new Map<string, number>();
    const lookbackIso = new Date(now - 15 * 60_000).toISOString();
    const { data: recent } = await (supabaseAdmin as any)
      .from("f1_race_odds_snapshots")
      .select("market_id, odds, snapshot_at")
      .in("market_id", ids)
      .gte("snapshot_at", lookbackIso)
      .order("snapshot_at", { ascending: false })
      .limit(ids.length * 4);
    for (const s of (recent ?? []) as Array<{ market_id: string; odds: number }>) {
      if (!latestByMarket.has(s.market_id)) latestByMarket.set(s.market_id, Number(s.odds));
    }

    const changed = rows.filter((r) => {
      const prev = latestByMarket.get(r.market_id);
      if (prev == null) return true;
      if (Math.abs(prev - r.odds) < 0.01) {
        skippedUnchanged += 1;
        return false;
      }
      return true;
    });
    if (!changed.length) continue;

    for (let i = 0; i < changed.length; i += 500) {
      const chunk = changed.slice(i, i + 500);
      const { error } = await (supabaseAdmin as any).from("f1_race_odds_snapshots").insert(chunk);
      if (!error) snapshots += chunk.length;
    }
  }
  return { races: races?.length ?? 0, snapshots, skippedUnchanged };
}
