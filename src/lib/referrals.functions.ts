import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
  if (!isAdmin) throw new Error("Forbidden");
}

export const getMyReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("referral_code").eq("id", userId).maybeSingle();
    const { data: rows } = await (supabase as any)
      .from("referrals")
      .select("id, referred_user_id, cumulative_settled_wagered, stage1_completed, stage2_completed, stage3_completed, total_tokens_awarded, flagged, created_at")
      .eq("referrer_user_id", userId)
      .order("created_at", { ascending: false });

    const refRows = (rows ?? []) as any[];
    const referredIds = refRows.map((r) => r.referred_user_id);
    let names = new Map<string, string>();
    if (referredIds.length) {
      const { data: profs } = await supabase
        .from("profiles").select("id, display_name").in("id", referredIds);
      names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_name]));
    }

    const items = refRows.map((r) => ({
      id: r.id,
      displayName: names.get(r.referred_user_id) ?? "Player",
      wagered: Number(r.cumulative_settled_wagered ?? 0),
      stage1: !!r.stage1_completed,
      stage2: !!r.stage2_completed,
      stage3: !!r.stage3_completed,
      tokensAwarded: Number(r.total_tokens_awarded ?? 0),
      createdAt: r.created_at,
      flagged: !!r.flagged,
    }));

    const activeReferrals = items.filter((i) => i.stage1).length;
    const tokensEarned = items.reduce((a, b) => a + b.tokensAwarded, 0);
    const pendingMilestones = items.reduce((a, r) => {
      let n = 0;
      if (!r.stage1) n++; if (!r.stage2) n++; if (!r.stage3) n++;
      return a + n;
    }, 0);

    return {
      referralCode: (profile as any)?.referral_code ?? null,
      totalReferrals: items.length,
      activeReferrals,
      tokensEarned,
      pendingMilestones,
      items,
    };
  });

export const adminGetReferralDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await (supabaseAdmin as any)
      .from("referrals")
      .select("id, referrer_user_id, referred_user_id, cumulative_settled_wagered, stage1_completed, stage2_completed, stage3_completed, total_tokens_awarded, flagged, flag_reason, created_at")
      .order("created_at", { ascending: false })
      .limit(500);

    const refRows = (rows ?? []) as any[];
    const userIds = Array.from(new Set(refRows.flatMap((r) => [r.referrer_user_id, r.referred_user_id])));
    const { data: profs } = userIds.length
      ? await (supabaseAdmin as any).from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_name]));

    const enriched = refRows.map((r) => ({
      ...r,
      referrer_name: names.get(r.referrer_user_id) ?? "—",
      referred_name: names.get(r.referred_user_id) ?? "—",
    }));

    const stats = {
      total: enriched.length,
      active: enriched.filter((r) => r.stage1_completed).length,
      flagged: enriched.filter((r) => r.flagged).length,
      tokensAwarded: enriched.reduce((a, b) => a + Number(b.total_tokens_awarded ?? 0), 0),
    };

    // Top-20 leaderboard by tokens awarded, grouped by referrer
    const byReferrer = new Map<string, { userId: string; name: string; tokens: number; count: number }>();
    for (const r of enriched) {
      const cur = byReferrer.get(r.referrer_user_id) ?? {
        userId: r.referrer_user_id, name: r.referrer_name, tokens: 0, count: 0,
      };
      cur.tokens += Number(r.total_tokens_awarded ?? 0);
      cur.count += 1;
      byReferrer.set(r.referrer_user_id, cur);
    }
    const leaderboard = Array.from(byReferrer.values())
      .sort((a, b) => b.tokens - a.tokens).slice(0, 20);

    return { stats, rows: enriched, leaderboard };
  });

export const adminAdjustReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    referralId: z.string().uuid(),
    tokensDelta: z.number().int(),
    reason: z.string().min(3).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase as any).rpc("admin_adjust_referral", {
      p_referral_id: data.referralId,
      p_tokens_delta: data.tokensDelta,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminFlagReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    referralId: z.string().uuid(),
    flagged: z.boolean(),
    reason: z.string().min(3).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await (supabase as any).rpc("admin_flag_referral", {
      p_referral_id: data.referralId,
      p_flagged: data.flagged,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
