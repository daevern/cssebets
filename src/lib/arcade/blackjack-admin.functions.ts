import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Blackjack — admin/oversight server functions.
 *
 * Every handler verifies the caller's staff role through the *user's* client
 * (RLS applies) before any privileged read/write happens.
 */

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("admin") && !roles.includes("super_admin")) throw new Error("Forbidden");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

/** Recent hands across all players, with basic filters. */
export const adminListBlackjackHands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(500).default(0),
        pageSize: z.number().int().min(10).max(100).default(25),
        status: z
          .enum(["ALL", "PLAYER_TURN", "COMPLETED", "VOID", "REVERSED", "EXPIRED", "ERROR"])
          .default("ALL"),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context);
    const from = data.page * data.pageSize;
    let q = db
      .from("arcade_bj_hands")
      .select(
        "id, user_id, status, result, dealer_total, total_score_awarded, rule_version, score_version, " +
          "resolved_by, resolution_reason, created_at, settled_at",
        { count: "exact" },
      )
      .order("created_at", { ascending: false })
      .range(from, from + data.pageSize - 1);
    if (data.status !== "ALL") q = q.eq("status", data.status);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, username").in("id", ids)
      : { data: [] as any[] };
    const nameOf = new Map((profiles ?? []).map((p: any) => [p.id, p.username]));

    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, username: nameOf.get(r.user_id) ?? null })),
      total: count ?? 0,
    };
  });

/** Aggregate health/abuse signals: score awarded, win rates, top players. */
export const adminBlackjackOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context);
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const [handsRes, flagsRes] = await Promise.all([
      db
        .from("arcade_bj_hands")
        .select("user_id, result, total_score_awarded, status, created_at")
        .gte("created_at", since)
        .limit(5000),
      db
        .from("arcade_bj_risk_flags")
        .select("id, user_id, flag_type, severity, review_status, created_at")
        .eq("review_status", "open")
        .order("created_at", { ascending: false })
        .limit(25),
    ]);
    const rows = (handsRes.data ?? []) as any[];
    const completed = rows.filter((r) => r.status === "COMPLETED");
    const wins = completed.filter((r) => r.result === "WIN" || r.result === "BLACKJACK").length;

    const byUser = new Map<string, { hands: number; wins: number; score: number }>();
    for (const r of completed) {
      const e = byUser.get(r.user_id) ?? { hands: 0, wins: 0, score: 0 };
      e.hands += 1;
      if (r.result === "WIN" || r.result === "BLACKJACK") e.wins += 1;
      e.score += Number(r.total_score_awarded ?? 0);
      byUser.set(r.user_id, e);
    }
    const top = [...byUser.entries()]
      .map(([user_id, v]) => ({
        user_id,
        ...v,
        winRate: v.hands ? Number(((v.wins / v.hands) * 100).toFixed(1)) : 0,
        // A sustained win rate well above ~49% over a meaningful sample is the
        // signal worth eyeballing, not raw score.
        suspicious: v.hands >= 25 && v.wins / v.hands > 0.62,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    return {
      hands7d: rows.length,
      completed7d: completed.length,
      players7d: byUser.size,
      winRate7d: completed.length ? Number(((wins / completed.length) * 100).toFixed(1)) : 0,
      score7d: completed.reduce((a, r) => a + Number(r.total_score_awarded ?? 0), 0),
      openFlags: (flagsRes.data ?? []) as any[],
      top,
    };
  });

/** Void or reverse a hand (removes any score it awarded). Fully audited. */
export const adminResolveBlackjackHand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        handId: z.string().uuid(),
        action: z.enum(["VOID", "REVERSE"]),
        reason: z.string().trim().min(4).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context);
    const { error } = await db.rpc("arcade_bj_admin_resolve_hand", {
      p_admin: context.userId,
      p_hand: data.handId,
      p_action: data.action,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Publish a new rule version (previous version is retired, never edited). */
export const adminPublishBlackjackRules = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        patch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        reason: z.string().trim().min(4).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context);
    const { error } = await db.rpc("arcade_bj_publish_rule_config", {
      p_admin: context.userId,
      p_patch: data.patch,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Publish a new scoring version. */
export const adminPublishBlackjackScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        patch: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
        reason: z.string().trim().min(4).max(500),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const db = await assertAdmin(context);
    const { error } = await db.rpc("arcade_bj_publish_score_config", {
      p_admin: context.userId,
      p_patch: data.patch,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Current active rule + score config for the admin form. */
export const adminGetBlackjackConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await assertAdmin(context);
    const [rules, scores] = await Promise.all([
      db
        .from("arcade_bj_rule_configs")
        .select("*")
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("arcade_bj_score_configs")
        .select("*")
        .eq("status", "active")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    return { rules: rules.data as any, scoring: scores.data as any };
  });
