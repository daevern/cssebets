// F1 sync: races, drivers, standings, house-built odds snapshots, settlement.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchF1Races,
  fetchF1DriverStandings,
  fetchF1TeamStandings,
  fetchF1RaceResults,
  fetchF1Drivers,
  fetchF1Teams,
} from "../adapters/apiF1Adapter.server";
import {
  buildRaceWinnerOdds,
  buildPodiumOdds,
  buildPointsOdds,
  buildHeadToHeadOdds,
  buildChampionshipOdds,
} from "./f1OddsBuilder.server";

const CURRENT_SEASON = new Date().getUTCFullYear();

async function isRunInFlight(task: string, minutes = 10) {
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
  const { data } = await (supabaseAdmin as any)
    .from("f1_sync_runs")
    .select("id")
    .eq("task", task)
    .eq("status", "running")
    .gt("started_at", cutoff)
    .maybeSingle();
  return !!data;
}

async function startRun(task: string) {
  if (await isRunInFlight(task)) return { id: null as string | null, skipped: true };
  const { data } = await (supabaseAdmin as any)
    .from("f1_sync_runs")
    .insert({ task, status: "running" })
    .select("id")
    .single();
  return { id: (data?.id ?? null) as string | null, skipped: false };
}

async function finishRun(id: string | null, status: "ok" | "error", extras: { records?: number; error?: string; meta?: any; durationMs?: number } = {}) {
  if (!id) return;
  await (supabaseAdmin as any)
    .from("f1_sync_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      duration_ms: extras.durationMs,
      records: extras.records,
      error: extras.error,
      meta: extras.meta,
    })
    .eq("id", id);
}

function keyify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Try requested season, then fall back up to 3 previous seasons if the
// provider has no data yet (common early in the year on free tiers).
async function fetchF1RacesWithFallback(seasonPref: number) {
  for (let s = seasonPref; s >= seasonPref - 3; s--) {
    const races = await fetchF1Races(s);
    if (races && races.length > 0) return { season: s, races };
  }
  return { season: seasonPref, races: [] as Awaited<ReturnType<typeof fetchF1Races>> };
}

// ---- Sync races ----
export async function syncF1Races(seasonPref = CURRENT_SEASON) {
  const start = Date.now();
  const run = await startRun("races");
  if (run.skipped) return { ok: true, skipped: "already running" };
  try {
    const { season, races } = await fetchF1RacesWithFallback(seasonPref);
    const grandsPrix = races.filter((r) => r.type?.toLowerCase() === "race");
    const usingFallback = season !== seasonPref;
    // When the provider hasn't published the requested season yet, shift the
    // historical calendar forward so users see a "live" schedule and markets.
    const yearShiftMs = usingFallback ? (seasonPref - season) * 365.25 * 24 * 3600 * 1000 : 0;
    let n = 0;
    for (const r of grandsPrix) {
      const race_key = `${season}-r${r.id}`;
      const originalDate = new Date(r.date);
      const shiftedDate = new Date(originalDate.getTime() + yearShiftMs);
      const rawStatus = r.status?.toLowerCase() ?? "";
      const status = usingFallback
        ? (shiftedDate.getTime() < Date.now() - 3 * 3600_000 ? "finished" : "scheduled")
        : rawStatus.includes("finished") ? "finished" : rawStatus.includes("progress") ? "in_progress" : "scheduled";
      await (supabaseAdmin as any).from("f1_races").upsert(
        {
          race_key,
          provider_id: r.id,
          season: usingFallback ? seasonPref : season,
          round: (races.filter((x) => x.competition.id === r.competition.id && x.type?.toLowerCase() === "race" && x.date <= r.date).length),
          name: r.competition.name,
          circuit: r.circuit?.name ?? null,
          country: r.competition.location?.country ?? null,
          starts_at: shiftedDate.toISOString(),
          status,
        },
        { onConflict: "race_key" },
      );
      n++;
    }
    // Season row
    await (supabaseAdmin as any).from("f1_seasons").upsert(
      { year: season, name: `Formula 1 ${season}`, is_active: true },
      { onConflict: "year" },
    );
    await finishRun(run.id, "ok", { records: n, meta: { seasonUsed: season }, durationMs: Date.now() - start });
    return { ok: true, races: n, seasonUsed: season };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}

async function resolveActiveSeason(pref = CURRENT_SEASON) {
  // Prefer requested season if it has races; otherwise use the most recent year in f1_races.
  const { data: hit } = await (supabaseAdmin as any)
    .from("f1_races").select("season").eq("season", pref).limit(1);
  if (hit && hit.length) return pref;
  const { data: latest } = await (supabaseAdmin as any)
    .from("f1_races").select("season").order("season", { ascending: false }).limit(1);
  return latest?.[0]?.season ?? pref;
}

// Probe API-Sports for the most recent season with actual data (drivers/standings).
async function probeApiSeason(pref: number, probe: (s: number) => Promise<any[]>) {
  for (let s = pref; s >= pref - 3; s--) {
    const rows = await probe(s);
    if (rows && rows.length > 0) return { season: s, rows };
  }
  return { season: pref, rows: [] as any[] };
}

// ---- Sync drivers + teams ----
export async function syncF1DriversAndTeams(seasonPref = CURRENT_SEASON) {
  const start = Date.now();
  const run = await startRun("drivers");
  if (run.skipped) return { ok: true, skipped: "already running" };
  try {
    const teamProbe = await probeApiSeason(seasonPref, (s) => fetchF1Teams(s));
    const driverProbe = await probeApiSeason(seasonPref, (s) => fetchF1Drivers(s));
    const teams = teamProbe.rows;
    const drivers = driverProbe.rows;
    for (const t of teams) {
      await (supabaseAdmin as any).from("f1_constructors").upsert(
        { team_key: keyify(t.name), provider_id: t.id, name: t.name, active: true, logo_url: t.logo ?? null },
        { onConflict: "team_key" },
      );
    }
    for (const d of drivers) {
      const teamName = d.teams?.[0]?.team?.name ?? null;
      await (supabaseAdmin as any).from("f1_drivers").upsert(
        {
          driver_key: keyify(d.name),
          provider_id: d.id,
          name: d.name,
          abbr: d.abbr ?? null,
          number: d.number ?? null,
          nationality: d.nationality ?? null,
          team_key: teamName ? keyify(teamName) : null,
          active: true,
          photo_url: d.image ?? null,
        },
        { onConflict: "driver_key" },
      );
    }
    await finishRun(run.id, "ok", { records: drivers.length + teams.length, durationMs: Date.now() - start });
    return { ok: true, drivers: drivers.length, teams: teams.length };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}

// ---- Build markets for upcoming races ----
export async function syncF1Odds(seasonPref = CURRENT_SEASON) {
  const start = Date.now();
  const run = await startRun("odds");
  if (run.skipped) return { ok: true, skipped: "already running" };
  try {
    // Get standings for house odds (probe back through recent seasons if provider is empty)
    const standProbe = await probeApiSeason(seasonPref, (s) => fetchF1DriverStandings(s));
    const standings: any[] = standProbe.rows;
    const dataSeason = standProbe.season;
    const standingByName: Record<string, number> = {};
    for (const s of standings) standingByName[keyify(s.driver.name)] = s.points ?? 0;

    // All scheduled/in-progress races we have on file — build markets for the full remaining calendar
    const { data: races } = await (supabaseAdmin as any)
      .from("f1_races")
      .select("id, race_key, name, starts_at, status, provider_id, season")
      .neq("status", "finished")
      .order("starts_at", { ascending: true });

    // Active drivers
    const { data: drivers } = await (supabaseAdmin as any)
      .from("f1_drivers")
      .select("driver_key, name, team_key")
      .eq("active", true);
    const driverList: Array<{ driver_key: string; name: string; team_key: string | null }> = drivers ?? [];

    let marketsUpserted = 0;
    for (const race of races ?? []) {
      const inputs = driverList.map((d) => ({
        driverKey: d.driver_key,
        points: standingByName[d.driver_key] ?? 0,
        gridPosition: null,
      }));
      const winnerOdds = buildRaceWinnerOdds(inputs);
      const podium = buildPodiumOdds(winnerOdds);
      const points = buildPointsOdds(winnerOdds);

      // Upsert race_winner + podium + points markets
      for (let i = 0; i < driverList.length; i++) {
        const d = driverList[i];
        const w = winnerOdds[i];
        const po = podium[i];
        const pt = points[i];
        for (const [type, odds] of [["race_winner", w.offeredOdds], ["podium", po.offeredOdds], ["points_finish", pt.offeredOdds]] as const) {
          const { data: m } = await (supabaseAdmin as any).from("f1_race_markets").upsert(
            {
              race_id: race.id,
              market_type: type,
              selection_key: d.driver_key,
              label: d.name,
              odds,
              status: "open",
            },
            { onConflict: "race_id,market_type,selection_key,secondary_selection_key" },
          ).select("id").single();
          if (m?.id) {
            await (supabaseAdmin as any).from("f1_race_odds_snapshots").insert({ market_id: m.id, odds });
            marketsUpserted++;
          }
        }
      }

      // H2H — teammates only (keeps market count sane)
      const byTeam: Record<string, Array<{ key: string; name: string; prob: number }>> = {};
      for (let i = 0; i < driverList.length; i++) {
        const d = driverList[i];
        if (!d.team_key) continue;
        (byTeam[d.team_key] ??= []).push({ key: d.driver_key, name: d.name, prob: winnerOdds[i].probability });
      }
      for (const pair of Object.values(byTeam)) {
        if (pair.length < 2) continue;
        const [a, b] = pair;
        const h2h = buildHeadToHeadOdds({ key: a.key, probability: a.prob }, { key: b.key, probability: b.prob });
        for (const [sel, secondary, label, odds] of [
          [a.key, b.key, `${a.name} beats ${b.name}`, h2h.aOdds],
          [b.key, a.key, `${b.name} beats ${a.name}`, h2h.bOdds],
        ] as const) {
          const { data: m } = await (supabaseAdmin as any).from("f1_race_markets").upsert(
            {
              race_id: race.id,
              market_type: "head_to_head",
              selection_key: sel,
              secondary_selection_key: secondary,
              label,
              odds,
              status: "open",
            },
            { onConflict: "race_id,market_type,selection_key,secondary_selection_key" },
          ).select("id").single();
          if (m?.id) {
            await (supabaseAdmin as any).from("f1_race_odds_snapshots").insert({ market_id: m.id, odds });
            marketsUpserted++;
          }
        }
      }
    }

    // Championship outrights
    const remaining = (races ?? []).filter((r: any) => r.status !== "finished").length || 1;
    const champInputs = standings.map((s) => ({ key: keyify(s.driver.name), points: s.points ?? 0 }));
    const champOdds = buildChampionshipOdds(champInputs, remaining);
    for (let i = 0; i < champOdds.length; i++) {
      const c = champOdds[i];
      const s = standings[i];
      await (supabaseAdmin as any).from("f1_championship_markets").upsert(
        {
          season: seasonPref,
          market_type: "drivers",
          selection_key: c.driverKey,
          label: s.driver.name,
          odds: c.offeredOdds,
          status: "open",
        },
        { onConflict: "season,market_type,selection_key" },
      );
    }
    const teamStandings = await (async () => {
      const probe = await probeApiSeason(seasonPref, (s) => fetchF1TeamStandings(s));
      return probe.rows;
    })();
    const teamInputs = teamStandings.map((s) => ({ key: keyify(s.team.name), points: s.points ?? 0 }));
    const teamChampOdds = buildChampionshipOdds(teamInputs, remaining);
    for (let i = 0; i < teamChampOdds.length; i++) {
      const c = teamChampOdds[i];
      const s = teamStandings[i];
      await (supabaseAdmin as any).from("f1_championship_markets").upsert(
        {
          season: seasonPref,
          market_type: "constructors",
          selection_key: c.driverKey,
          label: s.team.name,
          odds: c.offeredOdds,
          status: "open",
        },
        { onConflict: "season,market_type,selection_key" },
      );
    }

    await finishRun(run.id, "ok", { records: marketsUpserted, durationMs: Date.now() - start });
    return { ok: true, marketsUpserted, races: races?.length ?? 0 };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}
