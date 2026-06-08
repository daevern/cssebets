import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}

// ---------- USER ----------

export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("wallets").select("balance, updated_at").eq("user_id", userId).maybeSingle();
    if (data) return { balance: Number(data.balance), updated_at: data.updated_at };
    // Auto-create via admin if missing (trigger normally handles it)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("wallets").upsert({ user_id: userId }, { onConflict: "user_id" });
    return { balance: 0, updated_at: new Date().toISOString() };
  });

export const listMyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(200).default(50) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows, error } = await supabase
      .from("wallet_transactions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { transactions: rows ?? [] };
  });

const RequestSchema = z.object({
  amount: z.number().min(1).max(1_000_000),
  reason: z.string().trim().max(500).optional().nullable(),
});

export const requestPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => RequestSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("point_requests")
      .insert({
        user_id: userId,
        requested_amount: data.amount,
        reason: data.reason ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("point_requests")
      .select("*")
      .eq("user_id", userId)
      .order("requested_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { requests: data ?? [] };
  });

// ---------- ADMIN ----------

export const adminListRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("point_requests")
      .select("*")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: reqs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((reqs ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
    return {
      requests: (reqs ?? []).map((r) => ({
        ...r,
        display_name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? r.user_id.slice(0, 8),
      })),
    };
  });

export const adminApproveRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("wallet_approve_request", {
      p_request_id: data.requestId,
      p_admin_id: userId,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "wallet.approve_request",
      entity: "point_request",
      entity_id: data.requestId,
      metadata: { new_balance: result },
    });
    return { ok: true, newBalance: Number(result) };
  });

export const adminRejectRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("wallet_reject_request", {
      p_request_id: data.requestId,
      p_admin_id: userId,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "wallet.reject_request",
      entity: "point_request",
      entity_id: data.requestId,
      metadata: {},
    });
    return { ok: true };
  });

const AdjustSchema = z.object({
  targetUserId: z.string().uuid(),
  amount: z.number().refine((n) => n !== 0, "amount must be non-zero").refine((n) => Math.abs(n) <= 1_000_000),
  note: z.string().trim().max(500).optional(),
});

export const adminAdjustWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AdjustSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const type = data.amount > 0 ? "credit" : "debit";
    const { data: result, error } = await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: data.targetUserId,
      p_type: type,
      p_amount: Math.abs(data.amount),
      p_reference_type: "admin_adjustment",
      p_reference_id: undefined as unknown as string,
      p_note: data.note ?? `Admin adjustment by ${userId.slice(0, 8)}`,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "wallet.admin_adjust",
      entity: "wallet",
      entity_id: data.targetUserId,
      metadata: { amount: data.amount, note: data.note ?? null },
    });
    const row = Array.isArray(result) ? result[0] : result;
    return { ok: true, newBalance: Number(row?.new_balance ?? 0) };
  });

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").order("display_name");
    const { data: wallets } = await supabaseAdmin.from("wallets").select("user_id, balance");
    const wmap = new Map((wallets ?? []).map((w) => [w.user_id, Number(w.balance)]));
    return {
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        display_name: p.display_name,
        balance: wmap.get(p.id) ?? 0,
      })),
    };
  });
