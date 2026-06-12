// Public (any authenticated user) trigger for football-data sync.
// Used by the matches page on mount + on a short interval so finished
// matches are reflected without waiting for an admin to click Sync.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const refreshMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { runFootballDataSync } = await import("@/lib/sync.server");
    return runFootballDataSync({ userId: context.userId });
  });

export const getMatchOddsHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { matchId: string }) => input)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("match_odds_snapshots")
      .select("id, sampled_at, home_odds, draw_odds, away_odds, source")
      .eq("match_id", data.matchId)
      .order("sampled_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
