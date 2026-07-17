// Football settlement engine. Determines which selections won for each market
// on a finished event and calls settle_sports_market_atomic to credit winners.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type EventRow = {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  final_result: any;
  competition_code: string;
};

type MarketRow = {
  id: string;
  market_key: string;
  period: string;
  line: number | null;
};

async function selectionIdsFor(marketId: string, keys: string[]): Promise<string[]> {
  if (keys.length === 0) return [];
  const { data } = await supabaseAdmin
    .from("sports_market_selections" as any)
    .select("id, selection_key")
    .eq("sports_market_id", marketId)
    .in("selection_key", keys);
  return (data ?? []).map((r: any) => r.id);
}

// Returns array of winning selection keys, or null when we cannot resolve.
function decideWinningKeys(marketKey: string, home: number, away: number): string[] | null {
  switch (marketKey) {
    case "match_result":
      if (home > away) return ["home"];
      if (home < away) return ["away"];
      return ["draw"];
    case "double_chance":
      if (home > away) return ["1x", "12"];
      if (home < away) return ["12", "x2"];
      return ["1x", "x2"];
    case "total_goals_2_5":
      return home + away > 2.5 ? ["over_2_5"] : ["under_2_5"];
    case "btts":
      return home > 0 && away > 0 ? ["yes"] : ["no"];
    // 1h_result requires HT score — handled separately
    default:
      return null;
  }
}

export async function settleFootballEvent(eventId: string, opts: { triggeredBy?: string | null } = {}) {
  const { data: eventData } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id, status, home_score, away_score, final_result, competition_code")
    .eq("id", eventId)
    .maybeSingle();
  const event = eventData as EventRow | null;
  if (!event) throw new Error("Event not found");
  if (event.status !== "finished") throw new Error(`Event not finished (status=${event.status})`);
  if (event.home_score == null || event.away_score == null) throw new Error("Missing final score");

  const { data: run } = await supabaseAdmin
    .from("sports_settlement_runs" as any)
    .insert({ sports_event_id: eventId, status: "pending", triggered_by: opts.triggeredBy ?? null })
    .select("id")
    .single();
  const runId = (run as any)?.id as string;

  const { data: markets } = await supabaseAdmin
    .from("sports_markets" as any)
    .select("id, market_key, period, line, status")
    .eq("sports_event_id", eventId)
    .neq("status", "settled")
    .neq("status", "void");

  let marketsSettled = 0;
  let totalPayout = 0;
  let betsSettled = 0;

  for (const m of (markets ?? []) as any[]) {
    const winningKeys = decideWinningKeys(m.market_key, event.home_score!, event.away_score!);
    if (!winningKeys) {
      // Void unsupported / unresolvable markets so users get refunds
      const { data: res } = await (supabaseAdmin as any).rpc("settle_sports_market_atomic", {
        p_market_id: m.id,
        p_winning_selection_ids: [],
        p_void: true,
        p_run_id: runId,
      });
      const row = Array.isArray(res) ? res[0] : res;
      marketsSettled++;
      betsSettled += Number(row?.bets_updated ?? 0);
      totalPayout += Number(row?.total_payout ?? 0);
      continue;
    }
    const winningIds = await selectionIdsFor(m.id, winningKeys);
    const { data: res, error } = await (supabaseAdmin as any).rpc("settle_sports_market_atomic", {
      p_market_id: m.id,
      p_winning_selection_ids: winningIds,
      p_void: false,
      p_run_id: runId,
    });
    if (error) continue;
    const row = Array.isArray(res) ? res[0] : res;
    marketsSettled++;
    betsSettled += Number(row?.bets_updated ?? 0);
    totalPayout += Number(row?.total_payout ?? 0);
  }

  await supabaseAdmin
    .from("sports_settlement_runs" as any)
    .update({
      status: "success",
      finished_at: new Date().toISOString(),
      markets_settled: marketsSettled,
      bets_settled: betsSettled,
      total_payout: totalPayout,
    })
    .eq("id", runId);

  // Save final result snapshot
  await supabaseAdmin
    .from("sports_results" as any)
    .upsert(
      {
        sports_event_id: eventId,
        provider: "api-football",
        final_home_score: event.home_score,
        final_away_score: event.away_score,
        ft_status: "FT",
      },
      { onConflict: "sports_event_id" } as any,
    );

  return { runId, marketsSettled, betsSettled, totalPayout };
}

export async function settleFinishedFootballEvents(opts: { max?: number } = {}) {
  const max = opts.max ?? 20;
  const { data: events } = await supabaseAdmin
    .from("sports_events" as any)
    .select("id")
    .eq("sport_code", "football")
    .eq("status", "finished")
    .order("scheduled_at", { ascending: true })
    .limit(max);

  const results: any[] = [];
  for (const e of (events ?? []) as any[]) {
    // Skip if all markets already settled
    const { count } = await supabaseAdmin
      .from("sports_markets" as any)
      .select("*", { count: "exact", head: true })
      .eq("sports_event_id", e.id)
      .not("status", "in", "(settled,void)");
    if ((count ?? 0) === 0) continue;
    try {
      results.push(await settleFootballEvent(e.id));
    } catch (err: any) {
      results.push({ id: e.id, error: err?.message ?? String(err) });
    }
  }
  return results;
}
