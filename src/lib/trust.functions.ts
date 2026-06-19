import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* All read-only aggregate fns powering the Trust & Transparency surfaces.
   The DB functions are SECURITY DEFINER and only return safe, masked data. */

export const getPlatformPulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_platform_pulse");
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
  });

export const getRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_recent_activity");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      kind: string;
      who: string;
      at: string;
      detail: string;
    }>;
  });

export const getPayoutPerformance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_payout_performance");
    if (error) throw new Error(error.message);
    return data as {
      avg_processing_hours: number | null;
      total_completed: number;
      largest_completed: number | null;
      success_rate: number | null;
      updated_at: string;
    };
  });

export const getCommunityGrowth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_community_growth");
    if (error) throw new Error(error.message);
    return data as {
      members_this_month: number;
      bets_this_month: number;
      payouts_this_month: number;
      updated_at: string;
    };
  });

export const getPlatformStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_platform_status");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{
      service: string;
      status: "operational" | "degraded" | "offline" | "unknown";
      last_checked: string | null;
    }>;
  });

export const getSupportStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_support_stats");
    if (error) throw new Error(error.message);
    return data as {
      open: number;
      in_review: number;
      awaiting_user: number;
      resolved: number;
      avg_first_response_hours: number | null;
      updated_at: string;
    };
  });

export const getMyBadges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("trust_my_badges", {
      _user: context.userId,
    });
    if (error) throw new Error(error.message);
    return data as {
      verified_member: boolean;
      first_bet: boolean;
      ten_bets: boolean;
      hundred_bets: boolean;
      winning_streak: boolean;
      payout_completed: boolean;
      bets: number;
      wins: number;
      payouts: number;
    };
  });
