// F1 settlement: race markets settle from race results; championship settles at season end.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { fetchF1RaceResults, fetchF1FastestLap } from "../adapters/apiF1Adapter.server";
import { rpcWalletApplyChange } from "@/lib/supabase-rpc.server";
import { captureServerException } from "@/lib/sentry.report.server";

function keyify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

type F1ResultRow = {
  position: number | null;
  points?: number | null;
  driver?: { name?: string | null } | null;
  team?: { name?: string | null } | null;
  constructor?: { name?: string | null } | null;
};

function asResultRows(value: Json | null | undefined): F1ResultRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is F1ResultRow => !!r && typeof r === "object");
}

function driverName(row: F1ResultRow | null | undefined): string | null {
  const name = row?.driver?.name;
  return typeof name === "string" && name.length > 0 ? name : null;
}

export async function settleF1RaceById(raceId: string) {
  const { data: race } = await supabaseAdmin
    .from("f1_races")
    .select("id, race_key, provider_id, status, settled_at, results, fastest_lap")
    .eq("id", raceId)
    .single();
  if (!race) throw new Error("race not found");
  if (race.status === "finished" && race.settled_at) return { ok: true, alreadySettled: true };

  // Prefer seeded / stored results (E2E + offline) over a live provider pull.
  let ordered: F1ResultRow[] = [];
  let fastestLapTop: F1ResultRow | null = null;
  if (race.fastest_lap && typeof race.fastest_lap === "object" && !Array.isArray(race.fastest_lap)) {
    fastestLapTop = race.fastest_lap as F1ResultRow;
  }
  const seeded = asResultRows(race.results);
  if (seeded.length > 0) {
    ordered = seeded
      .filter((r) => r.position != null || driverName(r))
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
  } else {
    if (!race.provider_id) throw new Error("no provider_id");
    const results = await fetchF1RaceResults(race.provider_id);
    if (!results.length) return { ok: false, error: "no results yet" };
    ordered = results
      .filter((r) => r.position != null)
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999)) as F1ResultRow[];
    if (!ordered.length) return { ok: false, error: "no ranked results yet" };
    try {
      const fl = await fetchF1FastestLap(race.provider_id);
      const top = fl.sort((a, b) => (a.position ?? 999) - (b.position ?? 999))[0];
      if (top?.driver?.name) fastestLapTop = top as F1ResultRow;
    } catch {
      fastestLapTop = null;
    }
  }

  if (!ordered.length) return { ok: false, error: "no ranked results yet" };

  const winnerName = driverName(ordered[0]);
  const winner = winnerName ? keyify(winnerName) : null;
  const podium = new Set(
    ordered.slice(0, 3).map((r) => driverName(r)).filter((n): n is string => !!n).map(keyify),
  );
  const top5 = new Set(
    ordered.slice(0, 5).map((r) => driverName(r)).filter((n): n is string => !!n).map(keyify),
  );
  const pointsFinishers = new Set(
    ordered.slice(0, 10).map((r) => driverName(r)).filter((n): n is string => !!n).map(keyify),
  );
  const positionByKey: Record<string, number> = {};
  for (const r of ordered) {
    const name = driverName(r);
    if (name && r.position != null) positionByKey[keyify(name)] = r.position;
  }

  const teamPoints: Record<string, { pts: number; bestPos: number }> = {};
  for (const r of ordered) {
    const teamName = r.team?.name ?? r.constructor?.name;
    if (!teamName) continue;
    const tk = keyify(teamName);
    const cur = teamPoints[tk] ?? { pts: 0, bestPos: 999 };
    cur.pts += Number(r.points ?? 0);
    cur.bestPos = Math.min(cur.bestPos, r.position ?? 999);
    teamPoints[tk] = cur;
  }
  const topConstructor = Object.entries(teamPoints).sort((a, b) => {
    if (b[1].pts !== a[1].pts) return b[1].pts - a[1].pts;
    return a[1].bestPos - b[1].bestPos;
  })[0]?.[0] ?? null;

  const fastestLapKey = (() => {
    const n = driverName(fastestLapTop);
    return n ? keyify(n) : null;
  })();

  await supabaseAdmin
    .from("f1_races")
    .update({
      results: ordered as unknown as Json,
      fastest_lap: (fastestLapTop as unknown as Json) ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", raceId);

  const { data: markets } = await supabaseAdmin
    .from("f1_race_markets")
    .select("id, market_type, selection_key, secondary_selection_key, status")
    .eq("race_id", raceId)
    .neq("status", "settled");

  let settled = 0;
  for (const m of markets ?? []) {
    let winning: boolean | null = null;
    if (m.market_type === "race_winner") winning = m.selection_key === winner;
    else if (m.market_type === "podium") winning = podium.has(m.selection_key);
    else if (m.market_type === "top_5_finish") winning = top5.has(m.selection_key);
    else if (m.market_type === "points_finish") winning = pointsFinishers.has(m.selection_key);
    else if (m.market_type === "top_constructor_race") {
      if (topConstructor) winning = m.selection_key === topConstructor;
    } else if (m.market_type === "fastest_lap") {
      if (fastestLapKey) winning = m.selection_key === fastestLapKey;
    } else if (m.market_type === "head_to_head") {
      const a = positionByKey[m.selection_key];
      const b = m.secondary_selection_key ? positionByKey[m.secondary_selection_key] : undefined;
      if (a && b) winning = a < b;
    }
    if (winning === null) continue;
    await supabaseAdmin
      .from("f1_race_markets")
      .update({ winning, status: "settled", settled_at: new Date().toISOString() })
      .eq("id", m.id);
    settled++;

    const { data: bets } = await supabaseAdmin
      .from("f1_bets")
      .select("id, user_id, stake, potential_payout, status")
      .eq("market_id", m.id)
      .eq("status", "open");
    for (const bet of bets ?? []) {
      const newStatus = winning ? "won" : "lost";
      const { data: updatedBets, error: betUpdateError } = await supabaseAdmin
        .from("f1_bets")
        .update({ status: newStatus, settled_at: new Date().toISOString() })
        .eq("id", bet.id)
        .eq("status", "open")
        .select("id");

      if (betUpdateError) {
        captureServerException(betUpdateError, {
          area: "f1_settlement",
          tags: { race_id: raceId, bet_id: bet.id },
        });
        throw new Error(`f1 bet settlement failed: ${betUpdateError.message}`);
      }
      if (winning && (updatedBets?.length ?? 0) > 0) {
        const { error: walletError } = await rpcWalletApplyChange({
          p_user_id: bet.user_id,
          p_type: "credit",
          p_amount: bet.potential_payout,
          p_reference_type: "bet_settlement",
          p_reference_id: bet.id,
          p_note: "F1 bet win payout",
          p_is_simulation: false,
        });
        if (walletError) {
          captureServerException(walletError, {
            area: "f1_settlement",
            tags: { race_id: raceId, bet_id: bet.id, step: "wallet_apply_change" },
          });
          throw new Error(`f1 payout failed: ${walletError.message}`);
        }
      }
    }
  }

  await supabaseAdmin
    .from("f1_races")
    .update({
      status: "finished",
      settled_at: new Date().toISOString(),
      results: ordered as unknown as Json,
    })
    .eq("id", raceId);

  return { ok: true, settled };
}

// Called by cron: finds races that started > 2 hours ago and are not settled, tries to settle.
export async function runF1AutoSettle() {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

  const { data: openBets } = await supabaseAdmin
    .from("f1_bets")
    .select("race_id")
    .eq("status", "open")
    .not("race_id", "is", null)
    .limit(100);

  const openRaceIds = Array.from(
    new Set((openBets ?? []).map((b) => b.race_id).filter((id): id is string => !!id)),
  );
  const raceMap = new Map<string, { id: string }>();

  if (openRaceIds.length) {
    const { data: priorityRaces } = await supabaseAdmin
      .from("f1_races")
      .select("id")
      .is("settled_at", null)
      .lt("starts_at", cutoff)
      .in("id", openRaceIds)
      .order("starts_at", { ascending: false })
      .limit(10);

    for (const race of priorityRaces ?? []) raceMap.set(race.id, race);
  }

  const { data: fallbackRaces } = await supabaseAdmin
    .from("f1_races")
    .select("id")
    .is("settled_at", null)
    .lt("starts_at", cutoff)
    .order("starts_at", { ascending: true })
    .limit(5);

  for (const race of fallbackRaces ?? []) raceMap.set(race.id, race);

  const races = Array.from(raceMap.values()).slice(0, 10);
  const results: Array<Record<string, unknown>> = [];
  for (const r of races) {
    try {
      const res = await settleF1RaceById(r.id);
      results.push({ raceId: r.id, ...res });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      captureServerException(e, { area: "f1_settlement", tags: { race_id: r.id } });
      results.push({ raceId: r.id, ok: false, error: message });
    }
  }

  // When every race for the current season is finished, grade championship outrights.
  let championship: unknown = null;
  try {
    const season = new Date().getUTCFullYear();
    championship = await settleF1ChampionshipSeason(season);
  } catch (e: unknown) {
    captureServerException(e, { area: "f1_championship_settlement" });
    championship = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  return { checked: races.length, results, championship };
}

function keyifyName(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Settle open championship outrights when the season has no remaining races
 * (or when force=true for admin). Grades against live driver/constructor standings.
 */
export async function settleF1ChampionshipSeason(
  season: number,
  opts: {
    force?: boolean;
    /** Offline / E2E standings — skips live API when both provided. */
    driverWinnerKey?: string | null;
    constructorWinnerKey?: string | null;
  } = {},
) {
  const { count: remaining } = await supabaseAdmin
    .from("f1_races")
    .select("id", { count: "exact", head: true })
    .eq("season", season)
    .neq("status", "finished");

  if (!opts.force && (remaining ?? 0) > 0) {
    return { ok: false as const, error: "season_not_complete", remaining: remaining ?? 0 };
  }

  let driverWinner = opts.driverWinnerKey ? keyifyName(opts.driverWinnerKey) : null;
  let teamWinner = opts.constructorWinnerKey ? keyifyName(opts.constructorWinnerKey) : null;

  if (!driverWinner || !teamWinner) {
    const { fetchF1DriverStandings, fetchF1TeamStandings } = await import(
      "../adapters/apiF1Adapter.server"
    );
    const drivers = await fetchF1DriverStandings(season);
    const teams = await fetchF1TeamStandings(season);
    driverWinner = driverWinner ?? (drivers[0]?.driver?.name ? keyifyName(drivers[0].driver.name) : null);
    teamWinner = teamWinner ?? (teams[0]?.team?.name ? keyifyName(teams[0].team.name) : null);
  }

  if (!driverWinner && !teamWinner) {
    return { ok: false as const, error: "no_standings" };
  }

  const { data: markets } = await supabaseAdmin
    .from("f1_championship_markets")
    .select("id, market_type, selection_key, status")
    .eq("season", season)
    .eq("status", "open");

  let settled = 0;
  for (const m of markets ?? []) {
    let winning: boolean | null = null;
    if (m.market_type === "drivers" && driverWinner) {
      winning = m.selection_key === driverWinner;
    } else if (m.market_type === "constructors" && teamWinner) {
      winning = m.selection_key === teamWinner;
    }
    if (winning === null) continue;

    await supabaseAdmin
      .from("f1_championship_markets")
      .update({ winning, status: "settled", settled_at: new Date().toISOString() })
      .eq("id", m.id);
    settled++;

    const { data: bets } = await supabaseAdmin
      .from("f1_championship_bets")
      .select("id, user_id, stake, potential_payout, status")
      .eq("market_id", m.id)
      .eq("status", "open");

    for (const bet of bets ?? []) {
      const newStatus = winning ? "won" : "lost";
      const { data: updatedBets, error: betUpdateError } = await supabaseAdmin
        .from("f1_championship_bets")
        .update({ status: newStatus, settled_at: new Date().toISOString() })
        .eq("id", bet.id)
        .eq("status", "open")
        .select("id");
      if (betUpdateError) {
        captureServerException(betUpdateError, {
          area: "f1_championship_settlement",
          tags: { bet_id: bet.id },
        });
        throw new Error(`f1 champ bet settlement failed: ${betUpdateError.message}`);
      }
      if (winning && (updatedBets?.length ?? 0) > 0) {
        const { error: walletError } = await rpcWalletApplyChange({
          p_user_id: bet.user_id,
          p_type: "credit",
          p_amount: bet.potential_payout,
          p_reference_type: "bet_settlement",
          p_reference_id: bet.id,
          p_note: "F1 championship win payout",
          p_is_simulation: false,
        });
        if (walletError) {
          captureServerException(walletError, {
            area: "f1_championship_settlement",
            tags: { bet_id: bet.id, step: "wallet_apply_change" },
          });
          throw new Error(`f1 championship payout failed: ${walletError.message}`);
        }
      }
    }
  }

  return {
    ok: true as const,
    settled,
    driverWinner,
    teamWinner,
    remaining: remaining ?? 0,
  };
}
