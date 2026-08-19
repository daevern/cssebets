import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EventKind = "wc" | "football" | "f1" | "ufc";

export type CommentNode = {
  id: string;
  body: string;
  createdAt: string;
  userId: string;
  displayName: string;
  likeCount: number;
  likedByMe: boolean;
  position: string | null;
  replies: CommentNode[];
};

const eventInput = z.object({
  eventKind: z.enum(["wc", "football", "f1", "ufc"]),
  eventId: z.string().min(1).max(120),
  viewerId: z.string().uuid().optional(),
});

/** Public read: anyone (including demo visitors) can see the thread. */
export const listEventComments = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => eventInput.parse(i))
  .handler(async ({ data }) => {
    const { listCommentsForEvent } = await import("@/lib/comments.server");
    return listCommentsForEvent(data.eventKind, data.eventId, data.viewerId ?? null);
  });

export const postEventComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        eventKind: z.enum(["wc", "football", "f1", "ufc"]),
        eventId: z.string().min(1).max(120),
        body: z.string().trim().min(1).max(500),
        parentId: z.string().uuid().nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { screenComment } = await import("@/lib/comments-filter");
    const { enforceRateLimit, isRateLimitError } = await import("@/lib/rate-limit.functions");

    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("comments_banned_at")
      .eq("id", userId)
      .maybeSingle();
    if (profile?.comments_banned_at) throw new Error("You're not allowed to comment.");

    const verdict = screenComment(data.body);
    if (!verdict.ok) throw new Error(verdict.reason);

    try {
      await enforceRateLimit(`comment:${userId}`, "comment_post");
    } catch (e) {
      if (isRateLimitError(e)) throw new Error("You're commenting too fast — try again in a minute.");
      throw e;
    }

    // Block exact duplicate of this user's last comment on the event.
    const { data: last } = await (supabase as any)
      .from("event_comments")
      .select("body")
      .eq("user_id", userId)
      .eq("event_kind", data.eventKind)
      .eq("event_id", data.eventId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.body && String(last.body).trim() === verdict.body) {
      throw new Error("You already posted that.");
    }

    const { data: row, error } = await (supabase as any)
      .from("event_comments")
      .insert({
        event_kind: data.eventKind,
        event_id: data.eventId,
        user_id: userId,
        body: verdict.body,
        parent_id: data.parentId ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const toggleCommentLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await (supabase as any)
      .from("event_comment_likes")
      .select("id")
      .eq("comment_id", data.commentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (existing) {
      const { error } = await (supabase as any)
        .from("event_comment_likes")
        .delete()
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await (supabase as any)
      .from("event_comment_likes")
      .insert({ comment_id: data.commentId, user_id: userId });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const deleteMyComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("event_comments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", data.commentId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Whether the signed-in viewer may post (used to render the composer state). */
export const getMyCommentStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await (context.supabase as any)
      .from("profiles")
      .select("display_name, comments_banned_at")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      userId: context.userId,
      displayName: data?.display_name ?? "You",
      banned: !!data?.comments_banned_at,
    };
  });

// ---------------- Admin moderation ----------------

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => r.role === "admin" || r.role === "super_admin");
  if (!ok) throw new Error("Forbidden");
}

export const adminListComments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        eventId: z.string().trim().max(120).optional(),
        includeDeleted: z.boolean().default(false),
        limit: z.number().int().positive().max(500).default(200),
      })
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = (supabaseAdmin as any)
      .from("event_comments")
      .select("id, event_kind, event_id, user_id, body, parent_id, like_count, deleted_at, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (!data.includeDeleted) q = q.is("deleted_at", null);
    if (data.eventId) q = q.eq("event_id", data.eventId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await (supabaseAdmin as any)
          .from("profiles")
          .select("id, display_name, comments_banned_at")
          .in("id", ids)
      : { data: [] };
    const byId = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));

    let comments = ((rows ?? []) as any[]).map((r) => ({
      ...r,
      display_name: byId.get(r.user_id)?.display_name ?? "—",
      banned: !!byId.get(r.user_id)?.comments_banned_at,
    }));
    if (data.search) {
      const s = data.search.toLowerCase();
      comments = comments.filter(
        (c) => c.display_name.toLowerCase().includes(s) || String(c.body).toLowerCase().includes(s),
      );
    }

    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const live = comments.filter((c) => !c.deleted_at);
    const stats = {
      today: live.filter((c) => c.created_at >= dayAgo).length,
      commenters: new Set(live.map((c) => c.user_id)).size,
      deletedThisWeek: comments.filter((c) => c.deleted_at && c.deleted_at >= weekAgo).length,
    };
    return { comments, stats };
  });

export const adminDeleteComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ commentId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("event_comments")
      .update({ deleted_at: new Date().toISOString(), deleted_by: context.userId })
      .eq("id", data.commentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetCommentBan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ userId: z.string().uuid(), banned: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("profiles")
      .update({
        comments_banned_at: data.banned ? new Date().toISOString() : null,
        comments_banned_by: data.banned ? context.userId : null,
      })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
