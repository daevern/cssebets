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

export const getMyPayoutActionCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { count, error } = await supabase
      .from("payout_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "proof_uploaded");
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
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
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("payout_user_confirm" as any, {
      p_payout_id: data.payoutId,
      p_user_id: userId,
    });
    if (error) {
      const m = error.message || "";
      if (m.includes("NOT_FOUND")) throw new Error("Not found");
      if (m.includes("FORBIDDEN")) throw new Error("Not found");
      if (m.includes("INVALID_STATUS")) throw new Error("Not awaiting your confirmation");
      throw new Error(m || "Could not confirm payout");
    }
    const { data: pr } = await supabaseAdmin
      .from("payout_requests")
      .select("user_id, amount, status, approved_by, completed_by, bank_reference_no")
      .eq("id", data.payoutId)
      .maybeSingle();
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      target_user_id: pr?.user_id ?? userId,
      action: "payout.user_confirm",
      entity: "payout_request",
      entity_id: data.payoutId,
      metadata: {
        amount: pr?.amount ?? null,
        status: pr?.status ?? "completed",
        approved_by: (pr as any)?.approved_by ?? null,
        completed_by: (pr as any)?.completed_by ?? null,
        bank_reference_no: (pr as any)?.bank_reference_no ?? null,
      },
    });
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
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: rpcErr } = await supabaseAdmin.rpc("payout_user_reject_atomic" as any, {
      p_payout_id: data.payoutId,
      p_user_id: userId,
      p_reason: data.reason,
    });
    if (rpcErr) throw new Error(rpcErr.message);
    const { data: pr } = await supabaseAdmin
      .from("payout_requests")
      .select("user_id, amount, status, approved_by")
      .eq("id", data.payoutId)
      .maybeSingle();
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      target_user_id: pr?.user_id ?? userId,
      action: "payout.user_reject",
      entity: "payout_request",
      entity_id: data.payoutId,
      metadata: {
        amount: pr?.amount ?? null,
        status: pr?.status ?? null,
        approved_by: (pr as any)?.approved_by ?? null,
        reason: data.reason.slice(0, 200),
      },
    });
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

    const { error: rpcErr } = await supabaseAdmin.rpc("payout_approve_atomic" as any, {
      p_payout_id: data.payoutId,
      p_admin_id: userId,
    });
    if (rpcErr) {
      const m = rpcErr.message || "";
      if (m.includes("INSUFFICIENT_BALANCE")) throw new Error("User has insufficient balance.");
      if (m.includes("already")) throw new Error("Payout has already been processed.");
      throw new Error(m || "Could not approve payout.");
    }
    const { data: pr } = await supabaseAdmin
      .from("payout_requests")
      .select("user_id, amount, status, approved_by, bank_reference_no")
      .eq("id", data.payoutId)
      .maybeSingle();
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      target_user_id: pr?.user_id ?? null,
      action: "payout_approved",
      entity: "payout_request",
      entity_id: data.payoutId,
      metadata: {
        amount: pr?.amount ?? null,
        status: pr?.status ?? "approved",
        approved_by: userId,
        completed_by: null,
        bank_reference_no: (pr as any)?.bank_reference_no ?? null,
        self_approval: false,
        self_approval_allowed: false,
      },
    });
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
      .select("status, user_id, amount, approved_by")
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
        rejected_by: userId,
        rejected_at: new Date().toISOString(),
      } as any)
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      target_user_id: (row as any).user_id ?? null,
      action: "payout_rejected",
      entity: "payout_request",
      entity_id: data.payoutId,
      metadata: {
        amount: (row as any).amount ?? null,
        status: "rejected_by_admin",
        approved_by: (row as any).approved_by ?? null,
        rejected_by: userId,
        reason: data.reason,
      },
    });
    return { ok: true };
  });

const ProofSchema = z.object({
  payoutId: z.string().uuid(),
  filePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(255),
  fileType: z.string().min(1).max(100),
  fileSize: z.number().int().min(1).max(10 * 1024 * 1024),
  bankReferenceNo: z.string().trim().max(120).optional(),
  checkerNotes: z.string().trim().max(500).optional(),
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
      .select("id, user_id, amount, status, approved_by, reviewed_by")
      .eq("id", data.payoutId)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    if (row.status !== "approved") throw new Error(`Cannot upload proof: status=${row.status}`);

    // Maker-checker: the admin who approved must differ from the admin who completes,
    // unless allow_single_admin_self_approval is enabled in platform_settings.
    const approvedBy = (row as any).approved_by ?? (row as any).reviewed_by ?? null;
    const isSelf = approvedBy && approvedBy === userId;
    let allowSelf = false;
    if (isSelf) {
      const { data: ps } = await supabaseAdmin
        .from("platform_settings" as any)
        .select("allow_single_admin_self_approval")
        .eq("id", 1)
        .maybeSingle();
      allowSelf = !!(ps as any)?.allow_single_admin_self_approval;
      if (!allowSelf) {
        throw new Error(
          "Another admin must complete this payout. Single-admin self-approval is disabled in platform settings.",
        );
      }
    }

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
        completed_by: userId,
        bank_reference_no: data.bankReferenceNo ?? null,
        checker_notes: data.checkerNotes ?? null,
      } as any)
      .eq("id", data.payoutId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_log").insert({
      user_id: userId,
      target_user_id: (row as any).user_id ?? null,
      action: "payout_completed",
      entity: "payout_request",
      entity_id: data.payoutId,
      metadata: {
        amount: (row as any)?.amount ?? null,
        status: "proof_uploaded",
        completed_by: userId,
        approved_by: approvedBy,
        self_approval: !!isSelf,
        self_approval_allowed: !!allowSelf,
        bank_reference_no: data.bankReferenceNo ?? null,
      },
    });
    return { ok: true, selfApproval: !!isSelf };
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
