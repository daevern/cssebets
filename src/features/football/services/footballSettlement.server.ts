// Football settlement engine.
// Grades every market from the expanded mapper. Server-side, deterministic,
// idempotent (RPC settle_sports_market_atomic guards against re-settlement),
// atomic (per-market wallet+bet+bankroll transaction), and auditable
// (settlement_reason, winning_selection_keys, void_reason are persisted).

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decideWinningKeys, type MarketContext } from "./decideWinningKeys";
import { afFetchFixtureStatistics } from "../adapters/apiFootballAdapter.server";

type MatchStats = {
  homeCorners: number | null;
  awayCorners: number | null;
  homeCards: number | null;
  awayCards: number | null;
  redCards: number | null;
  raw: unknown;
};

const EMPTY_STATS: MatchStats = {
  homeCorners: null,
  awayCorners: null,
  homeCards: null,
  awayCards: null,
  redCards: null,
  raw: null,
};

function statValue(list: Array<{ type: string; value: number | string | null }>, type: string) {
  const row = list.find((s) => (s.type ?? "").toLowerCase() === type.toLowerCase());
  if (!row) return null;
  const n = Number(row.value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// Corners and cards are not derivable from the scoreline — pull the fixture
// statistics from API-Football so those markets can be graded instead of voided.
async function loadMatchStatistics(
  eventId: string,
  homeProviderId: string | null,
): Promise<MatchStats> {
  const { data: mapping } = await supabaseAdmin
    .from("sports_event_provider_mappings" as any)
    .select("provider_event_id")
    .eq("sports_event_id", eventId)
    .eq("provider", "api-football")
    .maybeSingle();
  const fixtureId = Number((mapping as any)?.provider_event_id);
  if (!Number.isFinite(fixtureId) || fixtureId <= 0) return EMPTY_STATS;

  const res = await afFetchFixtureStatistics(fixtureId);
  if (!res.ok || !Array.isArray(res.data) || res.data.length < 2) return EMPTY_STATS;

  const entries = res.data;
  let home = entries[0];
  let away = entries[1];
  if (homeProviderId != null) {
    const matched = entries.find((e) => String(e.team?.id) === String(homeProviderId));
    if (matched) {
      home = matched;
      away = entries.find((e) => e !== matched) ?? away;
    }
  }

  const hCorners = statValue(home.statistics ?? [], "Corner Kicks");
  const aCorners = statValue(away.statistics ?? [], "Corner Kicks");
  const hYellow = statValue(home.statistics ?? [], "Yellow Cards");
  const aYellow = statValue(away.statistics ?? [], "Yellow Cards");
  const hRed = statValue(home.statistics ?? [], "Red Cards");
  const aRed = statValue(away.statistics ?? [], "Red Cards");

  const cardsKnown = hYellow != null && aYellow != null;
  return {
    homeCorners: hCorners,
    awayCorners: aCorners,
    homeCards: cardsKnown ? (hYellow ?? 0) + (hRed ?? 0) : null,
    awayCards: cardsKnown ? (aYellow ?? 0) + (aRed ?? 0) : null,
    redCards: cardsKnown ? (hRed ?? 0) + (aRed ?? 0) : null,
    raw: entries,
  };
}


type EventRow = {
  id: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
  ht_home_score: number | null;
  ht_away_score: number | null;
  final_result: any;
  competition_code: string;
};

type MarketRow = {
  id: string;
  market_key: string;
  period: string;
  line: number | null;
  status: string;
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

async function writeSettlementAudit(
  marketId: string,
  patch: {
    settlement_reason?: string;
    winning_selection_keys?: string[] | null;
    void_reason?: string | null;
    settled_at?: string;
  },
) {
  await supabaseAdmin
    .from("sports_markets" as any)
    .update({ ...patch })
    .eq("id", marketId);
}

export async function settleFootballEvent(
  eventId: string,
  opts: { triggeredBy?: string | null } = {},
) {
  const { data: eventData } = await supabaseAdmin
    .from("sports_events" as any)
    .select(
      "id, status, home_score, away_score, ht_home_score, ht_away_score, final_result, competition_code, home_provider_id",
    )
    .eq("id", eventId)
    .maybeSingle();

  const event = eventData as EventRow | null;
  if (!event) throw new Error("Event not found");
  if (event.status !== "finished") throw new Error(`Event not finished (status=${event.status})`);
  if (event.home_score == null || event.away_score == null)
    throw new Error("Missing final score");

  const { data: run } = await supabaseAdmin
    .from("sports_settlement_runs" as any)
    .insert({
      sports_event_id: eventId,
      status: "pending",
      triggered_by: opts.triggeredBy ?? null,
    })
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
  const failures: string[] = [];
  const nowIso = new Date().toISOString();

  // Only spend an API call when a corner/card market is actually pending.
  const needsStats = ((markets ?? []) as any[]).some((m: any) =>
    /^(total|home|away)_(corners|cards)_/.test(m.market_key) || m.market_key === "red_card_match",
  );
  const stats = needsStats
    ? await loadMatchStatistics(eventId, (event as any).home_provider_id ?? null)
    : EMPTY_STATS;

  const ctx: MarketContext = {
    homeScore: event.home_score,
    awayScore: event.away_score,
    htHomeScore: event.ht_home_score,
    htAwayScore: event.ht_away_score,
    homeCorners: stats.homeCorners,
    awayCorners: stats.awayCorners,
    homeCards: stats.homeCards,
    awayCards: stats.awayCards,
    redCards: stats.redCards,
  };

  for (const m of ((markets ?? []) as unknown) as MarketRow[]) {
    const decision = decideWinningKeys(
      { marketKey: m.market_key, period: m.period, line: m.line },
      ctx,
    );


    // Unresolvable → void with reason
    if (decision.status === "void") {
      const { data: res, error: voidErr } = await (supabaseAdmin as any).rpc(
        "settle_sports_market_atomic",
        {
          p_market_id: m.id,
          p_winning_selection_ids: [],
          p_void: true,
          p_run_id: runId,
        },
      );
      if (voidErr) {
        const msg = `${m.market_key}: ${voidErr.message ?? String(voidErr)}`;
        console.warn("[football-settle] void failed", msg);
        failures.push(msg);
        continue;
      }
      const row = Array.isArray(res) ? res[0] : res;
      marketsSettled++;
      betsSettled += Number(row?.bets_updated ?? 0);
      totalPayout += Number(row?.total_payout ?? 0);
      await writeSettlementAudit(m.id, {
        settlement_reason: decision.reason,
        void_reason: decision.reason,
        winning_selection_keys: null,
        settled_at: nowIso,
      });
      continue;
    }

    let resolvedKeys = decision.winningKeys;
    let winningIds = await selectionIdsFor(m.id, resolvedKeys);
    // Correct score: an exact score outside the offered grid pays the
    // "other score" bucket rather than voiding the market.
    if (winningIds.length === 0 && m.market_key === "correct_score") {
      const other = await selectionIdsFor(m.id, ["other"]);
      if (other.length > 0) {
        resolvedKeys = ["other"];
        winningIds = other;
      }
    }
    // If we resolved keys but the market has no matching selection rows
    // (mapper drift, provider variance), void rather than pay nothing.
    if (winningIds.length === 0) {

      const { data: res, error: missErr } = await (supabaseAdmin as any).rpc(
        "settle_sports_market_atomic",
        {
          p_market_id: m.id,
          p_winning_selection_ids: [],
          p_void: true,
          p_run_id: runId,
        },
      );
      if (missErr) {
        const msg = `${m.market_key}: ${missErr.message ?? String(missErr)}`;
        console.warn("[football-settle] void (no selection) failed", msg);
        failures.push(msg);
        continue;
      }
      const row = Array.isArray(res) ? res[0] : res;
      marketsSettled++;
      betsSettled += Number(row?.bets_updated ?? 0);
      totalPayout += Number(row?.total_payout ?? 0);
      await writeSettlementAudit(m.id, {
        settlement_reason: `winning key(s) [${decision.winningKeys.join(",")}] not present as selections`,
        void_reason: "no matching selection",
        winning_selection_keys: decision.winningKeys,
        settled_at: nowIso,
      });
      continue;
    }

    const { data: res, error } = await (supabaseAdmin as any).rpc(
      "settle_sports_market_atomic",
      {
        p_market_id: m.id,
        p_winning_selection_ids: winningIds,
        p_void: false,
        p_run_id: runId,
      },
    );
    if (error) {
      const msg = `${m.market_key}: ${error.message ?? String(error)}`;
      console.warn("[football-settle] settle failed", msg);
      failures.push(msg);
      continue;
    }
    const row = Array.isArray(res) ? res[0] : res;
    marketsSettled++;
    betsSettled += Number(row?.bets_updated ?? 0);
    totalPayout += Number(row?.total_payout ?? 0);
    await writeSettlementAudit(m.id, {
      settlement_reason: decision.reason,
      winning_selection_keys: resolvedKeys,
      void_reason: null,
      settled_at: nowIso,
    });
  }


  await supabaseAdmin
    .from("sports_settlement_runs" as any)
    .update({
      status: failures.length > 0 ? "failed" : "success",
      notes: failures.length > 0 ? failures.slice(0, 20).join(" | ") : null,
      finished_at: new Date().toISOString(),
      markets_settled: marketsSettled,
      bets_settled: betsSettled,
      total_payout: totalPayout,
    })
    .eq("id", runId);

  await supabaseAdmin
    .from("sports_results" as any)
    .upsert(
      {
        sports_event_id: eventId,
        provider: "api-football",
        final_home_score: event.home_score,
        final_away_score: event.away_score,
        ht_home_score: event.ht_home_score,
        ht_away_score: event.ht_away_score,
        ft_status: "FT",
        raw_stats: {
          corners: { home: stats.homeCorners, away: stats.awayCorners },
          cards: { home: stats.homeCards, away: stats.awayCards, red: stats.redCards },
          provider_statistics: stats.raw,
        },
      },
      { onConflict: "sports_event_id" } as any,
    );


  return { runId, marketsSettled, betsSettled, totalPayout, failures };
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
