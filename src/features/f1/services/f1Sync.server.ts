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
  buildTop5Odds,
  buildFastestLapOdds,
  buildTopConstructorRaceOdds,
  buildHeadToHeadOdds,
  buildChampionshipOdds,
} from "./f1OddsBuilder.server";

// NOTE: Do NOT read `new Date()` at module scope — on Cloudflare Workers the
// clock is frozen at module init (returns 1970) until the first request runs.
function currentSeason() {
  return new Date().getUTCFullYear();
}


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

function chunk<T>(rows: T[], size = 500) {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function keyify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// ---- Sync races ----
export async function syncF1Races(seasonPref = currentSeason()) {
  const start = Date.now();
  const run = await startRun("races");
  if (run.skipped) return { ok: true, skipped: "already running" };
  try {
    const season = seasonPref;
    const races = await fetchF1Races(season);
    const grandsPrix = races
      .filter((r) => r.type?.toLowerCase() === "race")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let n = 0;
    for (const [index, r] of grandsPrix.entries()) {
      const race_key = `${season}-r${r.id}`;
      const rawStatus = r.status?.toLowerCase() ?? "";
      const status = rawStatus.includes("completed") || rawStatus.includes("finished")
        ? "finished"
        : rawStatus.includes("cancel")
          ? "cancelled"
          : rawStatus.includes("progress") || rawStatus.includes("live")
            ? "in_progress"
            : "scheduled";
      await (supabaseAdmin as any).from("f1_races").upsert(
        {
          race_key,
          provider_id: r.id,
          season,
          round: index + 1,
          name: r.competition.name,
          circuit: r.circuit?.name ?? null,
          country: r.competition.location?.country ?? null,
          starts_at: new Date(r.date).toISOString(),
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
    await finishRun(run.id, "ok", { records: n, meta: { seasonUsed: season, providerRows: races.length }, durationMs: Date.now() - start });
    return { ok: true, races: n, seasonUsed: season, providerRows: races.length };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}

async function resolveActiveSeason(pref = currentSeason()) {
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
export async function syncF1DriversAndTeams(seasonPref = currentSeason()) {
  const start = Date.now();
  const run = await startRun("drivers");
  if (run.skipped) return { ok: true, skipped: "already running" };
  try {
    // The API-Sports /drivers and /teams endpoints do not accept a `season`
    // query on the free plan. Derive the active grid from the standings
    // (rankings), which returns every current driver + their team in one call.
    const driverStandProbe = await probeApiSeason(seasonPref, (s) => fetchF1DriverStandings(s));
    const teamStandProbe = await probeApiSeason(seasonPref, (s) => fetchF1TeamStandings(s));
    const driverRows = driverStandProbe.rows;
    const teamRows = teamStandProbe.rows;
    const teamsSeen = new Map<string, { id: number; name: string; logo?: string }>();
    for (const t of teamRows) {
      if (t.team?.name) teamsSeen.set(keyify(t.team.name), t.team);
    }
    for (const d of driverRows) {
      if (d.team?.name && !teamsSeen.has(keyify(d.team.name))) teamsSeen.set(keyify(d.team.name), d.team);
    }
    for (const t of teamsSeen.values()) {
      await (supabaseAdmin as any).from("f1_constructors").upsert(
        { team_key: keyify(t.name), provider_id: t.id, name: t.name, active: true, logo_url: t.logo ?? null },
        { onConflict: "team_key" },
      );
    }
    for (const row of driverRows) {
      const d = row.driver;
      const teamName = row.team?.name ?? null;
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
    await finishRun(run.id, "ok", { records: driverRows.length + teamsSeen.size, durationMs: Date.now() - start });
    return { ok: true, drivers: driverRows.length, teams: teamsSeen.size };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}

// ---- Build markets for upcoming races ----
export async function syncF1Odds(seasonPref = currentSeason()) {
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
      .in("status", ["scheduled", "in_progress"])
      .order("starts_at", { ascending: true });

    // Active drivers
    const { data: drivers } = await (supabaseAdmin as any)
      .from("f1_drivers")
      .select("driver_key, name, team_key")
      .eq("active", true);
    const driverList: Array<{ driver_key: string; name: string; team_key: string | null }> = drivers ?? [];

    const marketRows: Array<{
      race_id: string;
      market_type: string;
      selection_key: string;
      secondary_selection_key: string;
      label: string;
      odds: number;
      status: string;
    }> = [];
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
          marketRows.push({
            race_id: race.id,
            market_type: type,
            selection_key: d.driver_key,
            secondary_selection_key: "",
            label: d.name,
            odds,
            status: "open",
          });
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
          marketRows.push({
            race_id: race.id,
            market_type: "head_to_head",
            selection_key: sel,
            secondary_selection_key: secondary,
            label,
            odds,
            status: "open",
          });
        }
      }
    }

    let marketsUpserted = 0;
    const snapshots: Array<{ market_id: string; odds: number }> = [];
    for (const rowsChunk of chunk(marketRows, 400)) {
      const { data: upserted, error } = await (supabaseAdmin as any)
        .from("f1_race_markets")
        .upsert(rowsChunk, { onConflict: "race_id,market_type,selection_key,secondary_selection_key" })
        .select("id, odds");
      if (error) throw new Error(`f1 market upsert failed: ${error.message}`);
      for (const m of upserted ?? []) snapshots.push({ market_id: m.id, odds: Number(m.odds) });
      marketsUpserted += upserted?.length ?? 0;
    }
    for (const snapshotChunk of chunk(snapshots, 500)) {
      const { error } = await (supabaseAdmin as any).from("f1_race_odds_snapshots").insert(snapshotChunk);
      if (error) throw new Error(`f1 odds snapshot failed: ${error.message}`);
    }

    // Championship outrights
    const remaining = (races ?? []).filter((r: any) => r.status !== "finished").length || 1;
    const champInputs = standings.map((s) => ({ key: keyify(s.driver.name), points: s.points ?? 0 }));
    const champOdds = buildChampionshipOdds(champInputs, remaining);
    const champMarketRows: Array<{
      season: number;
      market_type: string;
      selection_key: string;
      label: string;
      odds: number;
      status: string;
    }> = [];
    for (let i = 0; i < champOdds.length; i++) {
      const c = champOdds[i];
      const s = standings[i];
      champMarketRows.push({
        season: seasonPref,
        market_type: "drivers",
        selection_key: c.driverKey,
        label: s.driver.name,
        odds: c.offeredOdds,
        status: "open",
      });
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
      champMarketRows.push({
        season: seasonPref,
        market_type: "constructors",
        selection_key: c.driverKey,
        label: s.team.name,
        odds: c.offeredOdds,
        status: "open",
      });
    }
    if (champMarketRows.length > 0) {
      const { error } = await (supabaseAdmin as any)
        .from("f1_championship_markets")
        .upsert(champMarketRows, { onConflict: "season,market_type,selection_key" });
      if (error) throw new Error(`f1 championship market upsert failed: ${error.message}`);
    }

    await finishRun(run.id, "ok", { records: marketsUpserted, durationMs: Date.now() - start });
    return { ok: true, marketsUpserted, races: races?.length ?? 0 };
  } catch (e: any) {
    await finishRun(run.id, "error", { error: e.message, durationMs: Date.now() - start });
    throw e;
  }
}
