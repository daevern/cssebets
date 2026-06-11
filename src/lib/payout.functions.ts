import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const BUCKET = "payout-proofs";

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return (data ?? []).some((r: any) => r.role === "admin");
}

// ---------------- USER ----------------

export const getMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("payout_requests")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const active = (data ?? []).find((r: any) =>
      ["pending", "approved", "proof_uploaded"].includes(r.status),
    ) ?? null;
    return { payouts: data ?? [], active };
  });

export const createPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      bankName: z.string().trim().min(2).max(100),
      bankAccountNumber: z.string().trim().min(4).max(40),
      amount: z.number().min(1).max(10_000_000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Block if user already has an active payout
    const { data: existing } = await supabase
      .from("payout_requests")
      .select("id, status")
      .eq("user_id", userId)
      .in("status", ["pending", "approved", "proof_uploaded"])
      .maybeSingle();
    if (existing) throw new Error("You already have an active payout request.");

    // Check balance
    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || Number(wallet.balance) < data.amount) {
      throw new Error("Insufficient balance.");
    }

    const { data: inserted, error } = await supabase
      .from("payout_requests")
      .insert({
        user_id: userId,
        bank_name: data.bankName,
        bank_account_number: data.bankAccountNumber,
        amount: data.amount,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

export const userConfirmPayoutProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ payoutId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: e1 } = await supabase
      .from("payout_requests")
      .select("id, user_id, status")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row || row.user_id !== userId) throw new Error("Not found");
    if (row.status !== "proof_uploaded") throw new Error("Not awaiting your confirmation");
    const { error } = await supabase
      .from("payout_requests")
      .update({
        status: "completed",
        user_decision_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const userRejectPayoutProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      payoutId: z.string().uuid(),
      reason: z.string().trim().min(3, "Please provide a reason.").max(1000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: e1 } = await supabase
      .from("payout_requests")
      .select("id, user_id, status, amount")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row || row.user_id !== userId) throw new Error("Not found");
    if (row.status !== "proof_uploaded") throw new Error("Not awaiting your decision");

    // Refund debited points
    const { error: rpcErr } = await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: userId,
      p_type: "credit",
      p_amount: Number(row.amount),
      p_reference_type: "payout",
      p_reference_id: row.id,
      p_note: `Payout proof rejected: ${data.reason.slice(0, 200)}`,
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "rejected_by_user",
        user_decision_at: new Date().toISOString(),
        user_rejection_reason: data.reason,
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------- ADMIN ----------------

export const getPendingPayoutCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) return { count: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("payout_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "approved"]);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const adminListPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      status: z.enum(["active", "pending", "approved", "proof_uploaded", "completed", "rejected", "all"]).default("active"),
    }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("payout_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status === "active") q = q.in("status", ["pending", "approved", "proof_uploaded"]);
    else if (data.status === "rejected") q = q.in("status", ["rejected_by_admin", "rejected_by_user"]);
    else if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
    const { data: wallets } = await supabaseAdmin.from("wallets").select("user_id, balance").in("user_id", ids);
    const wmap = new Map((wallets ?? []).map((w) => [w.user_id, Number(w.balance)]));
    const emailMap = new Map<string, string>();
    for (const uid of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      } catch {}
    }
    return {
      payouts: (rows ?? []).map((r) => ({
        ...r,
        display_name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? r.user_id.slice(0, 8),
        email: emailMap.get(r.user_id) ?? null,
        current_balance: wmap.get(r.user_id) ?? 0,
      })),
    };
  });

export const adminApprovePayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ payoutId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row } = await supabaseAdmin
      .from("payout_requests")
      .select("id, user_id, status, amount")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.status !== "pending") throw new Error(`Cannot approve: status=${row.status}`);
    if (row.user_id === userId) throw new Error("Cannot approve your own payout");

    // Debit the user's wallet now
    const { error: rpcErr } = await supabaseAdmin.rpc("wallet_apply_change", {
      p_user_id: row.user_id,
      p_type: "debit",
      p_amount: Number(row.amount),
      p_reference_type: "payout",
      p_reference_id: row.id,
      p_note: "Payout approved — points debited",
    });
    if (rpcErr) throw new Error(rpcErr.message);

    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "approved",
        approved_at: new Date().toISOString(),
        reviewed_by: userId,
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRejectPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      payoutId: z.string().uuid(),
      reason: z.string().trim().min(3).max(1000),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("payout_requests")
      .select("status")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.status !== "pending") throw new Error(`Cannot reject: status=${row.status}`);
    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        status: "rejected_by_admin",
        rejection_reason: data.reason,
        reviewed_by: userId,
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const ProofSchema = z.object({
  payoutId: z.string().uuid(),
  filePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024),
});

export const adminConfirmPayoutProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProofSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("payout_requests")
      .select("id, user_id, status")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.status !== "approved") throw new Error(`Cannot upload proof: status=${row.status}`);

    const expectedPrefix = `payouts/${row.user_id}/${row.id}/`;
    if (!data.filePath.startsWith(expectedPrefix)) throw new Error("Invalid file path");

    const { error } = await supabaseAdmin
      .from("payout_requests")
      .update({
        proof_file_path: data.filePath,
        proof_file_name: data.fileName,
        proof_file_type: data.fileType,
        proof_file_size: data.fileSize,
        proof_uploaded_at: new Date().toISOString(),
        status: "proof_uploaded",
      })
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getPayoutProofSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ payoutId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("payout_requests")
      .select("user_id, proof_file_path, proof_file_type, proof_file_name")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row?.proof_file_path) throw new Error("No proof file");
    const admin = await isAdmin(supabase, userId);
    if (!admin && row.user_id !== userId) throw new Error("Forbidden");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(row.proof_file_path, 60 * 10);
    if (error) throw new Error(error.message);
    return {
      url: signed.signedUrl,
      type: row.proof_file_type ?? "",
      name: row.proof_file_name ?? "proof",
    };
  });
