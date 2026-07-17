// F1 settlement: race markets settle from race results; championship settles at season end.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchF1RaceResults } from "../adapters/apiF1Adapter.server";

function keyify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export async function settleF1RaceById(raceId: string) {
  const { data: race } = await (supabaseAdmin as any)
    .from("f1_races")
    .select("id, race_key, provider_id, status")
    .eq("id", raceId)
    .single();
  if (!race) throw new Error("race not found");
  if (race.status === "finished" && race.settled_at) return { ok: true, alreadySettled: true };
  if (!race.provider_id) throw new Error("no provider_id");

  const results = await fetchF1RaceResults(race.provider_id);
  if (!results.length) return { ok: false, error: "no results yet" };

  // Order by position
  const ordered = results
    .filter((r) => r.position != null)
    .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

  const winner = ordered[0]?.driver.name ? keyify(ordered[0].driver.name) : null;
  const podium = new Set(ordered.slice(0, 3).map((r) => keyify(r.driver.name)));
  const pointsFinishers = new Set(ordered.slice(0, 10).map((r) => keyify(r.driver.name)));
  const positionByKey: Record<string, number> = {};
  for (const r of ordered) positionByKey[keyify(r.driver.name)] = r.position!;

  const { data: markets } = await (supabaseAdmin as any)
    .from("f1_race_markets")
    .select("id, market_type, selection_key, secondary_selection_key, status")
    .eq("race_id", raceId)
    .neq("status", "settled");

  let settled = 0;
  for (const m of markets ?? []) {
    let winning: boolean | null = null;
    if (m.market_type === "race_winner") winning = m.selection_key === winner;
    else if (m.market_type === "podium") winning = podium.has(m.selection_key);
    else if (m.market_type === "points_finish") winning = pointsFinishers.has(m.selection_key);
    else if (m.market_type === "head_to_head") {
      const a = positionByKey[m.selection_key];
      const b = positionByKey[m.secondary_selection_key];
      if (a && b) winning = a < b;
    }
    if (winning === null) continue;
    await (supabaseAdmin as any)
      .from("f1_race_markets")
      .update({ winning, status: "settled", settled_at: new Date().toISOString() })
      .eq("id", m.id);
    settled++;

    // Settle bets on this market
    const { data: bets } = await (supabaseAdmin as any)
      .from("f1_bets")
      .select("id, user_id, stake, potential_payout, status")
      .eq("market_id", m.id)
      .eq("status", "open");
    for (const bet of bets ?? []) {
      const newStatus = winning ? "won" : "lost";
      await (supabaseAdmin as any)
        .from("f1_bets")
        .update({ status: newStatus, settled_at: new Date().toISOString() })
        .eq("id", bet.id);
      if (winning) {
        // Credit wallet via wallet_transactions (best-effort; caller handles ledger consistency)
        await (supabaseAdmin as any).from("wallet_transactions").insert({
          user_id: bet.user_id,
          amount: bet.potential_payout,
          type: "bet_win",
          description: `F1 bet win`,
          metadata: { source: "f1", bet_id: bet.id, market_id: m.id },
        });
      }
    }
  }

  await (supabaseAdmin as any)
    .from("f1_races")
    .update({ status: "finished", settled_at: new Date().toISOString(), results: ordered })
    .eq("id", raceId);

  return { ok: true, settled };
}

// Called by cron: finds races that started > 2 hours ago and not finished, tries to settle.
export async function runF1AutoSettle() {
  const cutoff = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  const { data: races } = await (supabaseAdmin as any)
    .from("f1_races")
    .select("id")
    .neq("status", "finished")
    .lt("starts_at", cutoff)
    .limit(5);
  const results: any[] = [];
  for (const r of races ?? []) {
    try {
      const res = await settleF1RaceById(r.id);
      results.push({ raceId: r.id, ...res });
    } catch (e: any) {
      results.push({ raceId: r.id, ok: false, error: e.message });
    }
  }
  return { checked: races?.length ?? 0, results };
}
