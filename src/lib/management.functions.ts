import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PROOF_BUCKET = "point-request-proofs";

type StaffRole = "customer_support" | "admin" | "super_admin";

async function getStaffRole(supabase: any, userId: string): Promise<StaffRole | null> {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (roles.includes("super_admin")) return "super_admin";
  if (roles.includes("admin")) return "admin";
  if (roles.includes("customer_support")) return "customer_support";
  return null;
}

async function audit(actorId: string, actorRole: string | null, action: string, payload: {
  target_type?: string; target_id?: string | null; target_user_id?: string | null;
  old_value?: any; new_value?: any; reason?: string | null;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("support_audit_logs").insert({
    actor_id: actorId,
    actor_role: actorRole,
    action_type: action,
    target_type: payload.target_type ?? null,
    target_id: payload.target_id ?? null,
    target_user_id: payload.target_user_id ?? null,
    old_value: payload.old_value ?? null,
    new_value: payload.new_value ?? null,
    reason: payload.reason ?? null,
  });
}

// ============= ROLE / IDENTITY =============

export const getMyStaffRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    return { role, userId: context.userId };
  });

// ============= DASHBOARD COUNTS =============

export const getStaffCounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) return { pendingUsers: 0, pendingPointRequests: 0, role: null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ count: pu }, { count: pr }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "pending"),
      supabaseAdmin.from("point_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    ]);
    return { pendingUsers: pu ?? 0, pendingPointRequests: pr ?? 0, role };
  });

// ============= PENDING USERS =============

export const staffListPendingUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pendingRoles } = await supabaseAdmin
      .from("user_roles").select("user_id, created_at").eq("role", "pending")
      .order("created_at", { ascending: false });
    if (!pendingRoles?.length) return { users: [] };
    const ids = pendingRoles.map((r) => r.user_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name, public_reference, phone_number").in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const emailMap = new Map<string, string>();
    for (const uid of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      } catch {}
    }
    return {
      users: pendingRoles.map((r) => {
        const p: any = pmap.get(r.user_id) ?? {};
        return {
          id: r.user_id,
          display_name: p.display_name ?? "",
          public_reference: p.public_reference ?? null,
          phone: p.phone_number ?? null,
          email: emailMap.get(r.user_id) ?? null,
          created_at: r.created_at,
        };
      }),
    };
  });

export const staffApproveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ targetUserId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    if (data.targetUserId === context.userId) throw new Error("Cannot approve yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotency: if already member, no-op
    const { data: existing } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.targetUserId);
    if ((existing ?? []).some((r: any) => r.role === "member")) {
      return { ok: true, alreadyApproved: true };
    }

    await supabaseAdmin.from("user_roles").delete()
      .eq("user_id", data.targetUserId).eq("role", "pending");
    const { error } = await supabaseAdmin.from("user_roles").upsert(
      { user_id: data.targetUserId, role: "member" },
      { onConflict: "user_id,role" }
    );
    if (error) throw new Error(error.message);

    // Add to default league (same behaviour as admin approve)
    const { data: league } = await supabaseAdmin.from("leagues").select("id").limit(1).maybeSingle();
    if (league) {
      await supabaseAdmin.from("league_members")
        .upsert({ league_id: league.id, user_id: data.targetUserId });
    }

    await audit(context.userId, role, "approve_registration", {
      target_type: "user", target_user_id: data.targetUserId, target_id: data.targetUserId,
    });
    return { ok: true };
  });

export const staffRejectUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    targetUserId: z.string().uuid(),
    reason: z.string().trim().min(1).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    if (data.targetUserId === context.userId) throw new Error("Cannot reject yourself");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Idempotency: don't override member
    const { data: existing } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.targetUserId);
    if ((existing ?? []).some((r: any) => r.role === "member" || r.role === "admin" || r.role === "super_admin")) {
      throw new Error("User already approved");
    }

    // Mark profile as suspended (acts as "rejected"); keep role=pending
    await supabaseAdmin.from("profiles")
      .update({ suspended: true }).eq("id", data.targetUserId);

    await audit(context.userId, role, "reject_registration", {
      target_type: "user", target_user_id: data.targetUserId, target_id: data.targetUserId,
      reason: data.reason,
    });
    return { ok: true };
  });

// ============= POINT REQUESTS =============

export const staffListPointRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "all"]).default("pending") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("point_requests").select("*")
      .neq("status", "pending_upload")
      .order("requested_at", { ascending: false }).limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: reqs, error } = await q;
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((reqs ?? []).map((r) => r.user_id)));
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name, public_reference, phone_number").in("id", ids);
    const { data: wallets } = await supabaseAdmin
      .from("wallets").select("user_id, balance").in("user_id", ids);
    const wmap = new Map((wallets ?? []).map((w) => [w.user_id, Number(w.balance)]));
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const emailMap = new Map<string, string>();
    for (const uid of ids) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (u?.user?.email) emailMap.set(uid, u.user.email);
      } catch {}
    }
    return {
      requests: (reqs ?? []).map((r: any) => {
        const p: any = pmap.get(r.user_id) ?? {};
        return {
          ...r,
          display_name: p.display_name ?? r.user_id.slice(0, 8),
          public_reference: r.public_reference ?? p.public_reference ?? null,
          phone: p.phone_number ?? null,
          email: emailMap.get(r.user_id) ?? null,
          current_balance: wmap.get(r.user_id) ?? 0,
        };
      }),
    };
  });

export const staffGetProofSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ requestId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("point_requests")
      .select("proof_file_path, proof_file_type, proof_file_name, user_id")
      .eq("id", data.requestId).maybeSingle();
    if (!row?.proof_file_path) throw new Error("No proof file");
    const { data: signed, error } = await supabaseAdmin.storage
      .from(PROOF_BUCKET).createSignedUrl(row.proof_file_path, 60 * 5);
    if (error) throw new Error(error.message);
    await audit(context.userId, role, "proof_viewed", {
      target_type: "point_request", target_id: data.requestId, target_user_id: row.user_id,
    });
    return {
      url: signed.signedUrl,
      type: row.proof_file_type ?? "",
      name: row.proof_file_name ?? "proof",
    };
  });

export const staffApprovePointRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ requestId: z.string().uuid(), note: z.string().trim().max(500).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("point_requests")
      .select("user_id, proof_file_path, status, requested_amount")
      .eq("id", data.requestId).maybeSingle();
    if (!row) throw new Error("Request not found");
    if (row.user_id === context.userId) throw new Error("Cannot approve your own request");
    if (!row.proof_file_path) throw new Error("Proof file missing");
    const { data: result, error } = await supabaseAdmin.rpc("staff_approve_point_request", {
      p_request_id: data.requestId,
      p_staff_id: context.userId,
      p_note: data.note ?? undefined,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, role, "approve_point_request", {
      target_type: "point_request", target_id: data.requestId, target_user_id: row.user_id,
      new_value: { new_balance: result, amount: row.requested_amount },
    });
    return { ok: true, newBalance: Number(result) };
  });

export const staffRejectPointRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      requestId: z.string().uuid(),
      reason: z.string().trim().min(1, "Reason required").max(500),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("point_requests")
      .select("user_id").eq("id", data.requestId).maybeSingle();
    if (!row) throw new Error("Request not found");
    if (row.user_id === context.userId) throw new Error("Cannot reject your own request");
    const { error } = await supabaseAdmin.rpc("staff_reject_point_request", {
      p_request_id: data.requestId,
      p_staff_id: context.userId,
      p_reason: data.reason,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, role, "reject_point_request", {
      target_type: "point_request", target_id: data.requestId, target_user_id: row.user_id,
      reason: data.reason,
    });
    return { ok: true };
  });

// ============= SUPER ADMIN: SUPPORT ACCOUNTS =============

const SUPPORT_EMAILS = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return { email: `support${n}@cssebets.com`, displayName: `CSSE Support ${n}` };
});

function generateStrongPassword(): string {
  // 24 chars from crypto-random bytes, base64url-ish (no padding/symbols).
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const b64 = Buffer.from(bytes).toString("base64")
    .replace(/\+/g, "A").replace(/\//g, "B").replace(/=/g, "");
  // Ensure at least one digit and one uppercase to satisfy common policies.
  return `Aa1${b64}`;
}

export const seedSupportAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (role !== "super_admin") throw new Error("Super admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const results: {
      email: string;
      status: "created" | "existed" | "rotated" | "error";
      password?: string;
      error?: string;
    }[] = [];

    for (const { email, displayName } of SUPPORT_EMAILS) {
      try {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
        let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        const password = generateStrongPassword();
        if (!user) {
          const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { display_name: displayName, force_password_change: true },
          });
          if (error) { results.push({ email, status: "error", error: error.message }); continue; }
          user = created.user!;
          results.push({ email, status: "created", password });
        } else {
          // Account already existed: rotate its password to a fresh random value
          // so any default/known credential can no longer sign in.
          const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
            password,
            user_metadata: { ...(user.user_metadata ?? {}), display_name: displayName, force_password_change: true },
          });
          if (updErr) { results.push({ email, status: "error", error: updErr.message }); continue; }
          results.push({ email, status: "rotated", password });
        }
        await supabaseAdmin.from("profiles").update({ display_name: displayName }).eq("id", user.id);
        await supabaseAdmin.from("user_roles").delete()
          .eq("user_id", user.id).eq("role", "pending");
        await supabaseAdmin.from("user_roles").upsert(
          { user_id: user.id, role: "customer_support" },
          { onConflict: "user_id,role" }
        );
      } catch (e) {
        results.push({ email, status: "error", error: e instanceof Error ? e.message : String(e) });
      }
    }
    // Audit log MUST NOT contain plaintext passwords — only outcome counts.
    await audit(context.userId, role, "seed_support_accounts", {
      target_type: "support_accounts",
      new_value: {
        summary: results.map((r) => ({ email: r.email, status: r.status, error: r.error })),
      },
    });
    return { results };
  });

export const listSupportAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (role !== "super_admin" && role !== "admin") throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("user_id, created_at").eq("role", "customer_support");
    const ids = (roleRows ?? []).map((r) => r.user_id);
    if (!ids.length) return { accounts: [] };
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name, suspended").in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const accounts: any[] = [];
    for (const r of roleRows ?? []) {
      let email: string | null = null;
      let lastSignIn: string | null = null;
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        email = u?.user?.email ?? null;
        lastSignIn = u?.user?.last_sign_in_at ?? null;
      } catch {}
      const p: any = pmap.get(r.user_id) ?? {};
      accounts.push({
        id: r.user_id,
        email,
        display_name: p.display_name ?? "",
        suspended: !!p.suspended,
        last_sign_in_at: lastSignIn,
        created_at: r.created_at,
      });
    }
    return { accounts: accounts.sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")) };
  });

export const setSupportAccountSuspended = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ targetUserId: z.string().uuid(), suspended: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (role !== "super_admin") throw new Error("Super admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles")
      .update({ suspended: data.suspended }).eq("id", data.targetUserId);
    await audit(context.userId, role, data.suspended ? "support_disabled" : "support_enabled", {
      target_type: "support_account", target_user_id: data.targetUserId,
    });
    return { ok: true };
  });

// ============= AUDIT LOG (admin+ read) =============

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (role !== "admin" && role !== "super_admin") throw new Error("Admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("support_audit_logs").select("*")
      .order("created_at", { ascending: false }).limit(data.limit);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

// ============= LOGIN AUDIT (called from client after sign-in attempt) =============

export const logManagementLoginAttempt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      success: z.boolean(),
      reason: z.string().max(200).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Trusted: actor_id is taken from the verified auth context, never the client.
    await supabaseAdmin.from("support_audit_logs").insert({
      actor_id: context.userId,
      actor_role: null,
      action_type: data.success ? "management_login_success" : "management_login_failed",
      target_type: "auth",
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

// ============= STAFF CHAT =============

export const staffListConversations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let query = supabaseAdmin
      .from("support_conversations")
      .select("*")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

    // Customer support can only see open conversations or ones they have personally claimed.
    if (role === "customer_support") {
      query = query.or(`status.eq.open,claimed_by.eq.${context.userId}`);
    }

    const { data: convs } = await query;
    if (!convs?.length) return { conversations: [] };
    const ids = convs.map((c: any) => c.user_id);
    const { data: profiles } = await supabaseAdmin
      .from("profiles").select("id, display_name, public_reference").in("id", ids);
    const pmap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    return {
      conversations: convs.map((c: any) => {
        const p: any = pmap.get(c.user_id) ?? {};
        const unread =
          c.last_user_message_at &&
          (!c.staff_last_read_at || new Date(c.staff_last_read_at) < new Date(c.last_user_message_at));
        return {
          ...c,
          display_name: p.display_name ?? c.user_id.slice(0, 8),
          public_reference: p.public_reference ?? null,
          hasUnread: !!unread,
        };
      }),
    };
  });

export const staffListMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("support_conversations").select("*").eq("id", data.conversationId).maybeSingle();
    if (!conv) throw new Error("Not found");

    // Enforce CS scope: open OR personally claimed.
    if (role === "customer_support" && conv.status !== "open" && conv.claimed_by !== context.userId) {
      await audit(context.userId, role, "support_access_denied", {
        target_type: "support_conversation",
        target_id: data.conversationId,
        reason: "customer_support attempted to read out-of-scope conversation",
      });
      throw new Error("Forbidden");
    }

    const { data: msgs } = await supabaseAdmin
      .from("support_messages").select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true }).limit(500);
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("display_name, public_reference, phone_number").eq("id", conv.user_id).maybeSingle();
    let email: string | null = null;
    try {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(conv.user_id);
      email = u?.user?.email ?? null;
    } catch {}
    return {
      conversation: conv,
      messages: msgs ?? [],
      user: { ...(profile ?? {}), email, id: conv.user_id },
    };
  });

export const staffSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      body: z.string().trim().max(2000).optional(),
      attachmentPath: z.string().optional(),
      attachmentName: z.string().optional(),
      attachmentType: z.string().optional(),
    }).refine((v) => (v.body && v.body.length > 0) || v.attachmentPath, { message: "Empty" })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("support_messages").insert({
      conversation_id: data.conversationId,
      sender_id: context.userId,
      sender_role: "staff",
      body: data.body ?? null,
      attachment_path: data.attachmentPath ?? null,
      attachment_name: data.attachmentName ?? null,
      attachment_type: data.attachmentType ?? null,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("support_conversations").update({
      last_message_at: now,
      last_staff_message_at: now,
      claimed_by: context.userId,
    }).eq("id", data.conversationId);
    await audit(context.userId, role, "support_message_sent", {
      target_type: "support_conversation", target_id: data.conversationId,
    });
    return { ok: true };
  });

export const staffMarkConvRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ conversationId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("support_conversations")
      .update({ staff_last_read_at: new Date().toISOString() })
      .eq("id", data.conversationId);
    return { ok: true };
  });

export const staffCloseConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ conversationId: z.string().uuid(), close: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("support_conversations")
      .update({ status: data.close ? "closed" : "open" })
      .eq("id", data.conversationId);
    await audit(context.userId, role, data.close ? "support_conversation_closed" : "support_conversation_reopened", {
      target_type: "support_conversation", target_id: data.conversationId,
    });
    return { ok: true };
  });

export const staffUnreadConvCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) return { count: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: convs } = await supabaseAdmin
      .from("support_conversations")
      .select("id, last_user_message_at, staff_last_read_at")
      .not("last_user_message_at", "is", null);
    const count = (convs ?? []).filter((c: any) =>
      !c.staff_last_read_at || new Date(c.staff_last_read_at) < new Date(c.last_user_message_at)
    ).length;
    return { count };
  });

export const staffGetSupportAttachmentUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage
      .from("support-attachments").createSignedUrl(data.path, 60 * 5);
    if (error) throw new Error(error.message);
    await audit(context.userId, role, "support_attachment_viewed", {
      target_type: "support_attachment", reason: data.path,
    });
    return { url: signed.signedUrl };
  });

// ============= SUPER ADMIN — RESET STAFF PASSWORD =============

export const resetSupportPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      targetUserId: z.string().uuid(),
      newPassword: z.string().min(8).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (role !== "super_admin") throw new Error("Super admin only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Confirm target is a support account (not another admin/super_admin)
    const { data: targetRoles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", data.targetUserId);
    const tr = (targetRoles ?? []).map((r: any) => r.role);
    if (!tr.includes("customer_support")) throw new Error("Target is not a support account");
    const { error: pwErr } = await supabaseAdmin.auth.admin.updateUserById(
      data.targetUserId, { password: data.newPassword },
    );
    if (pwErr) throw new Error(pwErr.message);
    await supabaseAdmin.from("profiles")
      .update({ force_password_change: true })
      .eq("id", data.targetUserId);
    await audit(context.userId, role, "support_password_reset", {
      target_type: "support_account", target_user_id: data.targetUserId,
    });
    return { ok: true };
  });

// ============= FORCE PASSWORD CHANGE (self) =============

export const getMyForcePasswordChange = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles").select("force_password_change").eq("id", context.userId).maybeSingle();
    return { force: !!data?.force_password_change };
  });

export const clearMyForcePasswordChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("profiles")
      .update({ force_password_change: false }).eq("id", context.userId);
    return { ok: true };
  });

// ============= STAFF USER DIRECTORY (view-only) =============

export const staffListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ search: z.string().trim().max(80).optional().default("") }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Forbidden");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("profiles")
      .select("id, display_name, suspended, created_at, phone_number")
      .order("display_name", { ascending: true })
      .limit(200);
    if (data.search) q = q.ilike("display_name", `%${data.search}%`);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p: any) => p.id);
    const [{ data: wallets }, { data: roleRows }] = await Promise.all([
      ids.length
        ? supabaseAdmin.from("wallets").select("user_id, balance").in("user_id", ids)
        : Promise.resolve({ data: [] as any[] }),
      ids.length
        ? supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const wmap = new Map((wallets ?? []).map((w: any) => [w.user_id, Number(w.balance)]));
    const rmap = new Map<string, string[]>();
    for (const r of roleRows ?? []) {
      const arr = rmap.get(r.user_id) ?? [];
      arr.push(r.role);
      rmap.set(r.user_id, arr);
    }

    // Fetch emails from auth in batch (paginated). For up to 200 users we
    // pull the first auth page; for production-scale this would page through.
    const emailMap = new Map<string, string | null>();
    const phoneMap = new Map<string, string | null>();
    try {
      const { data: page } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of page?.users ?? []) {
        emailMap.set(u.id, u.email ?? null);
        phoneMap.set(u.id, u.phone ?? null);
      }
    } catch {
      // ignore
    }

    return {
      role,
      users: (profiles ?? []).map((p: any) => ({
        id: p.id,
        display_name: p.display_name,
        suspended: !!p.suspended,
        created_at: p.created_at,
        balance: wmap.get(p.id) ?? 0,
        roles: rmap.get(p.id) ?? [],
        email: emailMap.get(p.id) ?? null,
        phoneNumber: phoneMap.get(p.id) ?? p.phone_number ?? null,
      })),
    };
  });

// ============= CUSTOMER SUPPORT MASKED SEARCH =============
// Allows customer_support (and admins) to look up a single user by
// public_reference, email or phone. Returns masked PII. Logged in audit.

function maskEmail(e: string | null | undefined): string | null {
  if (!e) return null;
  const [u, d] = e.split("@");
  if (!u || !d) return e;
  const head = u.slice(0, 1);
  return `${head}${"*".repeat(Math.max(1, u.length - 1))}@${d}`;
}
function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
}

export const staffSearchUserMasked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ q: z.string().trim().min(2).max(120) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const role = await getStaffRole(context.supabase, context.userId);
    if (!role) throw new Error("Staff only");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const q = data.q;
    const isEmailish = q.includes("@");
    const isPhoneish = /^[+\d\s\-()]{4,}$/.test(q);

    let matchedUserId: string | null = null;
    let matchedEmail: string | null = null;
    let matchedPhone: string | null = null;

    // Try by public_reference first
    const { data: byRef } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, public_reference, phone_number")
      .ilike("public_reference", q)
      .maybeSingle();
    let profile: any = byRef;

    if (!profile && (isEmailish || isPhoneish)) {
      // Fall back to auth admin lookup (page through first 1000 users)
      try {
        const { data: page } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const needle = q.toLowerCase();
        for (const u of page?.users ?? []) {
          if (
            (u.email && u.email.toLowerCase() === needle) ||
            (u.phone && u.phone.replace(/\D/g, "").endsWith(needle.replace(/\D/g, "")))
          ) {
            matchedUserId = u.id;
            matchedEmail = u.email ?? null;
            matchedPhone = u.phone ?? null;
            break;
          }
        }
      } catch { /* ignore */ }
      if (matchedUserId) {
        const { data: p } = await supabaseAdmin
          .from("profiles").select("id, display_name, public_reference, phone_number")
          .eq("id", matchedUserId).maybeSingle();
        profile = p;
      }
    } else if (profile) {
      try {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(profile.id);
        matchedEmail = u?.user?.email ?? null;
        matchedPhone = u?.user?.phone ?? null;
      } catch { /* ignore */ }
    }

    await audit(context.userId, role, "support_user_search", {
      target_type: "user",
      target_id: profile?.id ?? null,
      target_user_id: profile?.id ?? null,
      reason: `query="${q}"`,
      new_value: { found: !!profile },
    });

    if (!profile) return { found: false as const };

    // Pending point requests count (in-scope for CS)
    const { count: pendingRequests } = await supabaseAdmin
      .from("point_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", profile.id)
      .eq("status", "pending");

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", profile.id);
    const userRoles = (roles ?? []).map((r: any) => r.role);
    const status =
      userRoles.includes("pending") ? "pending" :
      userRoles.includes("rejected") ? "rejected" : "active";

    return {
      found: true as const,
      user: {
        id: profile.id,
        display_name: profile.display_name ?? null,
        public_reference: profile.public_reference ?? null,
        status,
        email_masked: maskEmail(matchedEmail),
        phone_masked: maskPhone(matchedPhone ?? profile.phone_number),
        pending_point_requests: pendingRequests ?? 0,
      },
    };
  });
