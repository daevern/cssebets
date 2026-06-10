import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_TIERS = ["admin", "super_admin", "viewer"] as const;
const WRITE_TIERS = ["admin", "super_admin"] as const;

async function requireTier(supabase: any, userId: string, tiers: readonly string[]) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role as string);
  if (!roles.some((r: string) => tiers.includes(r))) throw new Error("Forbidden");
}

export const getBankrollOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: bankroll }, { data: matches }, { count: openBets }, { count: settledBets }, { count: voidBets }] =
      await Promise.all([
        (supabaseAdmin as any).from("platform_bankroll").select("*").eq("id", 1).maybeSingle(),
        supabaseAdmin
          .from("matches")
          .select("id, home_team, away_team, status, home_liability, draw_liability, away_liability, worst_case_exposure")
          .gt("worst_case_exposure" as any, 0)
          .order("worst_case_exposure" as any, { ascending: false })
          .limit(20),
        supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).in("status", ["won", "lost"]),
        supabaseAdmin.from("predictions").select("id", { count: "exact", head: true }).eq("status", "void"),
      ]);

    const balance = Number((bankroll as any)?.balance ?? 0);
    const totalStakes = Number((bankroll as any)?.total_stakes_collected ?? 0);
    const totalPayouts = Number((bankroll as any)?.total_payouts_paid ?? 0);
    const netPL = totalStakes - totalPayouts;
    const totalExposure = (matches ?? []).reduce(
      (s: number, m: any) => s + Number(m.worst_case_exposure || 0),
      0,
    );
    const available = balance - totalExposure;

    const topMatch = (matches ?? [])[0] as any;
    const topOutcome = topMatch
      ? (["home", "draw", "away"] as const).reduce<{ k: string; v: number }>(
          (best, k) => {
            const v = Number(topMatch[`${k}_liability`] || 0);
            return v > best.v ? { k, v } : best;
          },
          { k: "—", v: 0 },
        )
      : { k: "—", v: 0 };

    return {
      bankroll: {
        balance,
        totalStakes,
        totalPayouts,
        netPL,
        totalExposure,
        available,
        updatedAt: (bankroll as any)?.updated_at ?? null,
      },
      bets: { open: openBets ?? 0, settled: settledBets ?? 0, void: voidBets ?? 0 },
      topLiabilityMatch: topMatch
        ? {
            id: topMatch.id,
            label: `${topMatch.home_team} vs ${topMatch.away_team}`,
            worst: Number(topMatch.worst_case_exposure || 0),
            outcome: topOutcome.k,
            outcomeValue: topOutcome.v,
          }
        : null,
      matches: (matches ?? []).map((m: any) => ({
        id: m.id,
        label: `${m.home_team} vs ${m.away_team}`,
        status: m.status,
        home: Number(m.home_liability || 0),
        draw: Number(m.draw_liability || 0),
        away: Number(m.away_liability || 0),
        worst: Number(m.worst_case_exposure || 0),
      })),
    };
  });

export const listPlatformTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      type: z.string().max(40).optional(),
      limit: z.number().int().min(1).max(500).default(200),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, ADMIN_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = (supabaseAdmin as any)
      .from("platform_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.type) q = q.eq("transaction_type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { transactions: rows ?? [] };
  });

export const adjustBankroll = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      action: z.enum(["topup", "withdraw"]),
      amount: z.number().positive().max(10_000_000),
      reason: z.string().trim().min(3).max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const txnType = data.action === "topup" ? "admin_topup" : "admin_withdrawal";
    const { data: newBal, error } = await (supabaseAdmin as any).rpc("platform_apply_change", {
      p_type: txnType,
      p_amount: data.amount,
      p_bet_id: null,
      p_match_id: null,
      p_note: data.reason,
    });
    if (error) {
      if (error.message?.includes("PLATFORM_INSUFFICIENT_BALANCE")) {
        throw new Error("Withdrawal exceeds bankroll balance.");
      }
      throw new Error(error.message);
    }
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: `bankroll.${data.action}`,
      entity: "platform_bankroll",
      new_value: { amount: data.amount, balance: newBal },
      reason: data.reason,
    });
    return { newBalance: Number(newBal) };
  });

export const voidMatchAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ matchId: z.string().uuid(), reason: z.string().trim().min(3).max(500) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireTier(supabase, userId, WRITE_TIERS);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { voidMatch } = await import("@/lib/settlement.server");
    const refunded = await voidMatch(data.matchId);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "match.void",
      entity: "match",
      entity_id: data.matchId,
      reason: data.reason,
      metadata: { refunded },
    });
    return { refunded };
  });
