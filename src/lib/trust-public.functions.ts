import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/* Public (unauthenticated) trust statistics for the landing page.
   Calls the same SECURITY DEFINER RPCs as the authenticated trust surfaces,
   but via a publishable-key client so SSR/anon visitors can read them.
   The RPCs return only aggregate or masked data — no personal info. */

function publicClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        storage: undefined,
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}

export const getPublicPlatformPulse = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await publicClient().rpc("trust_platform_pulse");
    if (error) throw new Error(error.message);
    return data as {
      registered_members: number;
      active_members_30d: number;
      bets_placed: number;
      bets_settled: number;
      approved_payouts: number;
      total_points_paid_out: number;
      avg_payout_processing_hours: number | null;
      avg_point_approval_hours: number | null;
      updated_at: string;
    };
  },
);

export const getPublicRecentActivity = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await publicClient().rpc("trust_recent_activity");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      kind: string;
      who: string;
      at: string;
      detail: string;
    }>;
  },
);

export const getPublicPayoutPerformance = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await publicClient().rpc("trust_payout_performance");
    if (error) throw new Error(error.message);
    return data as {
      winning_bets: number;
      largest_win_points: number | null;
      success_rate: number | null;
      updated_at: string;
    };
  },
);

export const getPublicPlatformStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await publicClient().rpc("trust_platform_status");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      service: string;
      status: "operational" | "degraded" | "offline" | "unknown";
      last_checked: string | null;
    }>;
  },
);

export const getPublicCommunityGrowth = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data, error } = await publicClient().rpc("trust_community_growth");
    if (error) throw new Error(error.message);
    return data as {
      views_this_week: number;
      bets_this_week: number;
      points_paid_out_this_week: number;
      updated_at: string;
    };
  },
);

export const recordHomeView = createServerFn({ method: "POST" }).handler(async () => {
  const { error } = await (publicClient().from("page_views" as any) as any).insert({ path: "/" });
  if (error) return { ok: false };
  return { ok: true };
});
