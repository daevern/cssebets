// Server functions for the football feature (client-callable via useServerFn).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabase as browserPublishable } from "@/integrations/supabase/client";
import type { FootballCompetitionCode } from "./config/footballCompetitions";
import type { FootballMatch, FootballMarket, FootballBet } from "./types/football";

const COMPETITION_CODES = ["EPL", "LA_LIGA", "SERIE_A", "UCL"] as const;

// ---------- Public lists ----------

export const listFootballMatches = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) =>
    z
      .object({
        competition: z.enum(COMPETITION_CODES),
        limit: z.number().int().min(1).max(100).default(50),
      })
      .parse(i),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await browserPublishable
      .from("sports_events" as any)
      .select(
        "id, competition_code, season, round, scheduled_at, status, venue, live_minute, home_name, away_name, home_logo, away_logo, home_short, away_short, home_score, away_score",
      )
      .eq("sport_code", "football")
      .eq("competition_code", data.competition)
      .eq("is_enabled", true)
      .order("scheduled_at", { ascending: true })
      .limit(data.limit);
    if (error) return { matches: [] as FootballMatch[] };

    const matches: FootballMatch[] = (rows ?? []).map((r: any) => ({
      id: r.id,
      competitionCode: r.competition_code as FootballCompetitionCode,
      competitionName: r.competition_code,
      season: r.season,
      round: r.round,
      kickoffAt: r.scheduled_at,
      status: r.status,
      liveMinute: r.live_minute,
      venue: r.venue,
      home: {
        name: r.home_name ?? "TBD",
        shortName: r.home_short,
        logo: r.home_logo,
        score: r.home_score,
      },
      away: {
        name: r.away_name ?? "TBD",
        shortName: r.away_short,
        logo: r.away_logo,
        score: r.away_score,
      },
    }));
    return { matches };
  });

export const getFootballMatch = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ matchId: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const { data: ev } = await browserPublishable
      .from("sports_events" as any)
      .select("*")
      .eq("id", data.matchId)
      .maybeSingle();
    if (!ev) throw new Error("Match not found");

    const { data: markets } = await browserPublishable
      .from("sports_markets" as any)
      .select(
        "id, market_key, display_name, category, period, line, status, sort_order, provider_odds_ts, last_odds_update_at, stale_after_seconds, suspension_reason, sports_market_selections (id, selection_key, display_name, line, decimal_odds, status, sort_order)",
      )
      .eq("sports_event_id", data.matchId)
      .order("sort_order", { ascending: true });

    const match: FootballMatch = {
      id: (ev as any).id,
      competitionCode: (ev as any).competition_code,
      competitionName: (ev as any).competition_code,
      season: (ev as any).season,
      round: (ev as any).round,
      kickoffAt: (ev as any).scheduled_at,
      status: (ev as any).status,
      liveMinute: (ev as any).live_minute,
      venue: (ev as any).venue,
      home: {
        name: (ev as any).home_name,
        shortName: (ev as any).home_short,
        logo: (ev as any).home_logo,
        score: (ev as any).home_score,
      },
      away: {
        name: (ev as any).away_name,
        shortName: (ev as any).away_short,
        logo: (ev as any).away_logo,
        score: (ev as any).away_score,
      },
    };

    // Compute derived "freshness" status client-side so the UI can show
    // "Market Suspended" even if the periodic sweep hasn't flipped the
    // status column yet. Everything computed here is a hint — the server
    // still enforces on bet placement.
    const nowMs = Date.now();
    const normalizedMarkets: (FootballMarket & {
      lastOddsUpdateAt: string | null;
      isStale: boolean;
      suspensionReason: string | null;
    })[] = (markets ?? []).map((m: any) => {
      const lastMs = m.last_odds_update_at ? new Date(m.last_odds_update_at).getTime() : null;
      const maxAgeMs = Number(m.stale_after_seconds ?? 600) * 1000;
      const isStale =
        m.status === "open" && lastMs != null && nowMs - lastMs > maxAgeMs;
      return {
        id: m.id,
        key: m.market_key,
        displayName: m.display_name,
        category: m.category,
        period: m.period,
        line: m.line,
        status: m.status,
        lastOddsUpdateAt: m.last_odds_update_at,
        isStale,
        suspensionReason: m.suspension_reason ?? (isStale ? "odds stale" : null),
        selections: (m.sports_market_selections ?? [])
          .slice()
          .sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((s: any) => ({
            id: s.id,
            key: s.selection_key,
            displayName: s.display_name,
            odds: Number(s.decimal_odds),
            line: s.line,
            status: s.status,
          })),
      };
    });

    return { match, markets: normalizedMarkets };
  });

export const listFootballFlags = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await browserPublishable
    .from("sports_feature_flags" as any)
    .select("key, enabled");
  const map: Record<string, boolean> = {};
  for (const r of (data ?? []) as any[]) map[r.key] = r.enabled;
  return map;
});

// ---------- Authenticated: my bets ----------

export const listMyFootballBets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("sports_bets" as any)
      .select("*")
      .eq("user_id", userId)
      .eq("sport_code", "football")
      .order("placed_at", { ascending: false })
      .limit(50);
    const bets: FootballBet[] = (data ?? []).map((r: any) => ({
      id: r.id,
      eventId: r.sports_event_id,
      marketKey: r.market_key,
      selectionKey: r.selection_key,
      selectionDisplay: r.selection_key,
      stake: Number(r.stake),
      acceptedOdds: Number(r.accepted_odds),
      potentialPayout: Number(r.potential_payout),
      actualPayout: r.actual_payout != null ? Number(r.actual_payout) : null,
      status: r.status,
      placedAt: r.placed_at,
      settledAt: r.settled_at,
    }));
    return { bets };
  });

// ---------- Place bet ----------

export const placeFootballBet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        eventId: z.string().uuid(),
        marketId: z.string().uuid(),
        selectionId: z.string().uuid(),
        stake: z.number().positive().min(10).max(50000),
        maxOdds: z.number().min(1.01).max(1000),
        idempotencyKey: z.string().min(8).max(64).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pre-flight: refuse bets on non-open / stale markets before we touch the
    // atomic RPC. The RPC also validates market status, but we short-circuit
    // here so the UI gets a clean freshness error instead of a generic one.
    const { data: mkt } = await (supabaseAdmin as any)
      .from("sports_markets")
      .select("status, last_odds_update_at, stale_after_seconds, suspension_reason")
      .eq("id", data.marketId)
      .maybeSingle();
    if (!mkt) throw new Error("This market is no longer available.");
    if (mkt.status !== "open") {
      throw new Error(
        mkt.suspension_reason
          ? `Market suspended (${mkt.suspension_reason}). Please try another market.`
          : "This market is not accepting bets right now.",
      );
    }
    if (mkt.last_odds_update_at) {
      const age = Date.now() - new Date(mkt.last_odds_update_at).getTime();
      const maxAge = Number(mkt.stale_after_seconds ?? 600) * 1000;
      if (age > maxAge) {
        throw new Error("Odds are stale — please refresh and try again.");
      }
    }

    const { data: betId, error } = await (supabaseAdmin as any).rpc("place_sports_bet_atomic", {
      p_user_id: userId,
      p_event_id: data.eventId,
      p_market_id: data.marketId,
      p_selection_id: data.selectionId,
      p_stake: data.stake,
      p_max_odds: data.maxOdds,
      p_idempotency_key: data.idempotencyKey ?? null,
    });
    if (error) {
      const msg = error.message ?? "";
      if (/Insufficient balance/i.test(msg))
        throw new Error("Insufficient points balance. Top up to place this bet.");
      if (/Odds changed/i.test(msg))
        throw new Error("Odds moved — please review the new price and try again.");
      if (/Market not available|Selection not available|Market not found|Selection not found/i.test(msg))
        throw new Error("This market is no longer available.");
      if (/Event not open|Markets closed/i.test(msg))
        throw new Error("Betting is closed on this match.");
      if (/Wallet not found/i.test(msg))
        throw new Error("Your wallet isn't ready yet. Please refresh and try again.");
      throw new Error("Could not place bet. Please try again.");
    }
    return { betId };
  });

// ---------- Admin ----------

async function requireAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) {
    throw new Error("Forbidden");
  }
}

export const adminSyncFootballFixtures = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ competition: z.enum(COMPETITION_CODES) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { syncFootballFixtures } = await import("./services/footballSync.server");
    return await syncFootballFixtures(data.competition);
  });

export const adminSyncFootballOdds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { syncFootballOddsBatch } = await import("./services/footballSync.server");
    return await syncFootballOddsBatch({ maxEvents: 12, freshnessMinutes: 5 });
  });

export const adminSettleFootball = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { settleFinishedFootballEvents } = await import("./services/footballSettlement.server");
    return await settleFinishedFootballEvents();
  });

export const adminSuspendStaleFootball = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { suspendStaleFootballMarkets } = await import(
      "./services/oddsFreshness.server"
    );
    return await suspendStaleFootballMarkets();
  });

export const adminSetFootballFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ key: z.string().min(1), enabled: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("sports_feature_flags" as any)
      .update({ enabled: data.enabled, updated_at: new Date().toISOString() })
      .eq("key", data.key);
    return { ok: true };
  });

export const adminListRecentSyncRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sports_sync_runs" as any)
      .select("id, provider, job_type, sport_code, competition_code, status, started_at, finished_at, records_fetched, records_created, records_updated")
      .eq("sport_code", "football")
      .order("started_at", { ascending: false })
      .limit(25);
    const { data: quota } = await supabaseAdmin
      .from("apifootball_quota")
      .select("day, used, day_limit, updated_at")
      .order("day", { ascending: false })
      .limit(1)
      .maybeSingle();
    return { runs: (data as any[]) ?? [], quota: quota ?? null };
  });
