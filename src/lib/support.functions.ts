import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enforceRateLimit } from "@/lib/rate-limit.functions";

const BUCKET = "support-attachments";

// ============= GET OR CREATE MY CONVERSATION =============

export const getOrCreateMyConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("support_conversations")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (existing) return { conversation: existing };
    const { data: created, error } = await supabaseAdmin
      .from("support_conversations")
      .insert({ user_id: context.userId })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { conversation: created };
  });

// ============= LIST MY MESSAGES =============

export const listMyMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("support_conversations")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conv) return { messages: [], conversationId: null };
    const { data: msgs } = await supabaseAdmin
      .from("support_messages")
      .select("*")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: true })
      .limit(500);
    return { messages: msgs ?? [], conversationId: conv.id };
  });

// ============= SEND MY MESSAGE =============

export const sendMyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      body: z.string().trim().max(2000).optional(),
      attachmentPath: z.string().optional(),
      attachmentName: z.string().optional(),
      attachmentType: z.string().optional(),
    }).refine((v) => (v.body && v.body.length > 0) || v.attachmentPath, {
      message: "Empty message",
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    try { await enforceRateLimit(`user:${context.userId}`, "support_message"); }
    catch (e) { if ((e as Error).message === "RATE_LIMITED") throw new Error("Too many requests. Please try again later."); throw e; }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Ensure conversation
    let { data: conv } = await supabaseAdmin
      .from("support_conversations").select("id").eq("user_id", context.userId).maybeSingle();
    if (!conv) {
      const { data: created } = await supabaseAdmin
        .from("support_conversations").insert({ user_id: context.userId }).select("id").single();
      conv = created!;
    }
    const now = new Date().toISOString();
    const { error } = await supabaseAdmin.from("support_messages").insert({
      conversation_id: conv.id,
      sender_id: context.userId,
      sender_role: "user",
      body: data.body ?? null,
      attachment_path: data.attachmentPath ?? null,
      attachment_name: data.attachmentName ?? null,
      attachment_type: data.attachmentType ?? null,
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("support_conversations").update({
      last_message_at: now,
      last_user_message_at: now,
      status: "open",
    }).eq("id", conv.id);
    return { ok: true };
  });

// ============= MARK READ =============

export const markMyMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("support_conversations")
      .update({ user_last_read_at: new Date().toISOString() })
      .eq("user_id", context.userId);
    return { ok: true };
  });

// ============= UNREAD COUNT (for nav badge) =============

export const getMyUnreadSupportCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: conv } = await supabaseAdmin
      .from("support_conversations")
      .select("id, last_staff_message_at, user_last_read_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!conv || !conv.last_staff_message_at) return { count: 0 };
    if (!conv.user_last_read_at || new Date(conv.user_last_read_at) < new Date(conv.last_staff_message_at)) {
      const { count } = await supabaseAdmin
        .from("support_messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conv.id)
        .eq("sender_role", "staff")
        .gt("created_at", conv.user_last_read_at ?? "1970-01-01");
      return { count: count ?? 0 };
    }
    return { count: 0 };
  });

// ============= ATTACHMENT UPLOAD URL =============

export const getMyAttachmentUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({
      fileName: z.string().min(1).max(200),
      contentType: z.string().max(100),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.fileName.replace(/[^\w.\-]/g, "_").slice(0, 100);
    const path = `${context.userId}/${Date.now()}-${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token, url: signed.signedUrl };
  });

export const getMyAttachmentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ path: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify access: must be in a message inside this user's conversation OR user is staff
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
    const isStaff = (roles ?? []).some((r: any) => ["customer_support","admin","super_admin"].includes(r.role));
    if (!isStaff && !data.path.startsWith(`${context.userId}/`)) {
      // Allow if staff sent the file inside this user's conversation
      const { data: msg } = await supabaseAdmin
        .from("support_messages")
        .select("conversation_id, support_conversations!inner(user_id)")
        .eq("attachment_path", data.path)
        .maybeSingle();
      if (!msg || (msg as any).support_conversations?.user_id !== context.userId) {
        throw new Error("Forbidden");
      }
    }
    const { data: signed, error } = await supabaseAdmin.storage
      .from(BUCKET).createSignedUrl(data.path, 60 * 5);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
