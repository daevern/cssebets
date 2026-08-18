import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Admin-only server fns for API-Football integration.
// The auth middleware injects an RLS-scoped client + userId; we then verify
// the caller holds the admin role before running any service-role work.
async function assertAdmin(ctx: any) {
  const supabase = ctx.context?.supabase;
  const uid = ctx.context?.userId;
  if (!supabase || !uid) throw new Error("not authenticated");
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", uid);
  const isAdmin = (roles ?? []).some((r: any) => r.role === "admin");
  if (!isAdmin) throw new Error("admin only");
}

export const getApiFootballStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx) => {
    await assertAdmin(ctx);

    const { getQuotaStatus } = await import("./apifootball.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const quota = await getQuotaStatus();

    const { count: linked } = await supabaseAdmin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .not("apifootball_fixture_id", "is", null);

    const { count: usingProvider } = await supabaseAdmin
      .from("match_market_odds")
      .select("id", { count: "exact", head: true } as any)
      .eq("source", "api-football");

    const { data: recent } = await supabaseAdmin
      .from("apifootball_odds_raw" as any)
      .select("match_id, fixture_id, fetched_at, bookmaker_count")
      .order("fetched_at", { ascending: false })
      .limit(10);

    return {
      quota,
      keyConfigured: !!process.env.API_FOOTBALL_KEY,
      linkedMatches: linked ?? 0,
      marketsFromProvider: usingProvider ?? 0,
      recent: recent ?? [],
    };
  },
);

export const triggerApiFootballSync = createServerFn({ method: "POST" })
  .inputValidator((d: { maxMatches?: number; hoursAhead?: number; freshnessHours?: number }) => d ?? {})
  .handler(async (ctx) => {
    await assertAdmin(ctx);
    const { syncUpcomingMatchOdds } = await import("./apifootball-sync.server");
    return await syncUpcomingMatchOdds(ctx.data ?? {});
  });

export const syncOneMatchApiFootball = createServerFn({ method: "POST" })
  .inputValidator((d: { matchId: string }) => {
    if (!d?.matchId) throw new Error("matchId required");
    return d;
  })
  .handler(async (ctx) => {
    await assertAdmin(ctx);
    const { syncMatchOddsApiFootball } = await import("./apifootball-sync.server");
    return await syncMatchOddsApiFootball(ctx.data.matchId);
  });
