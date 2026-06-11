import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROOF_BUCKET = "point-request-proofs";

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

// ---------- POINT REQUESTS (with proof upload) ----------

const AmountSchema = z.object({
  amount: z.number().min(1).max(1_000_000),
  reason: z.string().trim().max(500).optional().nullable(),
});

// Step 1: Create a draft (status=pending_upload). Returns id so client can upload to {user}/{id}.
export const createDraftPointRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => AmountSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("point_requests")
      .insert({
        user_id: userId,
        requested_amount: data.amount,
        reason: data.reason ?? null,
        status: "pending_upload",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: inserted.id };
  });

const ProofSchema = z.object({
  requestId: z.string().uuid(),
  filePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024),
});

// Step 2: Attach proof (still pending_upload until user clicks Request Points)
export const attachProofToRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ProofSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: e1 } = await supabase
      .from("point_requests")
      .select("id, user_id, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!existing || existing.user_id !== userId) throw new Error("Not found");
    if (existing.status !== "pending_upload") throw new Error("Request already submitted");
    // Enforce storage path matches owner+request
    const expectedPrefix = `point-requests/${userId}/${data.requestId}/`;
    if (!data.filePath.startsWith(expectedPrefix)) throw new Error("Invalid file path");
    const { error } = await supabase
      .from("point_requests")
      .update({
        proof_file_path: data.filePath,
        proof_file_name: data.fileName,
        proof_file_type: data.fileType,
        proof_file_size: data.fileSize,
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Step 3: User clicks Request Points -> transitions to pending
export const submitPointRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      amount: z.number().min(1).max(1_000_000),
      reason: z.string().trim().max(500).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error: e1 } = await supabase
      .from("point_requests")
      .select("id, user_id, status, proof_file_path")
      .eq("id", data.requestId)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row || row.user_id !== userId) throw new Error("Not found");
    if (row.status !== "pending_upload") throw new Error("Request already submitted");
    if (!row.proof_file_path) throw new Error("Please upload proof before requesting points.");
    const { error } = await supabase
      .from("point_requests")
      .update({
        status: "pending",
        requested_amount: data.amount,
        reason: data.reason ?? null,
        submitted_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Cancel/delete a draft + its storage file (used when user removes file)
export const cancelDraftPointRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("point_requests")
      .select("id, user_id, status, proof_file_path")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!row || row.user_id !== userId) return { ok: true };
    if (row.status !== "pending_upload") throw new Error("Cannot cancel submitted request");
    if (row.proof_file_path) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.storage.from(PROOF_BUCKET).remove([row.proof_file_path]);
    }
    await supabase.from("point_requests").delete().eq("id", data.requestId);
    return { ok: true };
  });

export const listMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("point_requests")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "pending_upload")
      .order("requested_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { requests: data ?? [] };
  });

// ---------- ADMIN ----------

export const getPendingPointRequestCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) return { count: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("point_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

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
      .neq("status", "pending_upload")
      .order("requested_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: reqs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((reqs ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name").in("id", ids);
    const { data: wallets } = await supabaseAdmin.from("wallets").select("user_id, balance").in("user_id", ids);
    const wmap = new Map((wallets ?? []).map((w) => [w.user_id, Number(w.balance)]));
    // Fetch emails via auth admin
    const emailMap = new Map<string, string>();
    for (const uid of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      } catch {}
    }
    return {
      requests: (reqs ?? []).map((r) => ({
        ...r,
        display_name: profiles?.find((p) => p.id === r.user_id)?.display_name ?? r.user_id.slice(0, 8),
        email: emailMap.get(r.user_id) ?? null,
        current_balance: wmap.get(r.user_id) ?? 0,
      })),
    };
  });

export const adminGetProofSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("point_requests")
      .select("proof_file_path, proof_file_type, proof_file_name")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!row?.proof_file_path) throw new Error("No proof file");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(row.proof_file_path, 60 * 10);
    if (error) throw new Error(error.message);
    return {
      url: signed.signedUrl,
      type: row.proof_file_type ?? "",
      name: row.proof_file_name ?? "proof",
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
    // Forbid approving own request
    const { data: row } = await supabaseAdmin
      .from("point_requests")
      .select("user_id, proof_file_path, status")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!row) throw new Error("Request not found");
    if (row.user_id === userId) throw new Error("Cannot approve your own request");
    if (!row.proof_file_path) throw new Error("Proof file missing");
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
    z.object({
      requestId: z.string().uuid(),
      rejectionReason: z.string().trim().min(1, "Rejection reason is required").max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!(await isAdmin(supabase, userId))) throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("wallet_reject_request", {
      p_request_id: data.requestId,
      p_admin_id: userId,
      p_note: data.rejectionReason,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("point_requests")
      .update({ rejection_reason: data.rejectionReason })
      .eq("id", data.requestId);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      action: "wallet.reject_request",
      entity: "point_request",
      entity_id: data.requestId,
      metadata: { rejection_reason: data.rejectionReason },
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

// Backward-compat: kept so any external import doesn't break.
export const requestPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    throw new Error("Deprecated: use createDraftPointRequest + attachProofToRequest + submitPointRequest");
  });
