import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SocialNotif = {
  id: string;
  kind: "comment_reply" | "comment_like";
  title: string;
  subtitle: string;
  timestamp: string;
  href: string;
};

function hrefFor(kind: string, eventId: string, commentId: string) {
  const base =
    kind === "f1"
      ? `/f1/races/${eventId}`
      : kind === "ufc"
      ? `/ufc/${eventId}`
      : `/matches/${eventId}`;
  return `${base}?comment=${commentId}`;
}

/** Replies to my comments + likes on my comments, over the last 30 days. */
export const listMySocialNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SocialNotif[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as any;
    const uid = context.userId;
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const { data: mine } = await db
      .from("event_comments")
      .select("id, body, event_kind, event_id")
      .eq("user_id", uid)
      .is("deleted_at", null)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(200);

    const myComments = (mine ?? []) as any[];
    if (!myComments.length) return [];
    const myIds = myComments.map((c) => c.id);
    const byId = new Map(myComments.map((c) => [c.id, c]));

    const [{ data: replies }, { data: likes }] = await Promise.all([
      db
        .from("event_comments")
        .select("id, user_id, body, parent_id, created_at, event_kind, event_id")
        .in("parent_id", myIds)
        .neq("user_id", uid)
        .is("deleted_at", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
      db
        .from("event_comment_likes")
        .select("id, comment_id, user_id, created_at")
        .in("comment_id", myIds)
        .neq("user_id", uid)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);

    const actorIds = Array.from(
      new Set([
        ...((replies ?? []) as any[]).map((r) => r.user_id),
        ...((likes ?? []) as any[]).map((l) => l.user_id),
      ]),
    );
    const { data: profs } = actorIds.length
      ? await db.from("profiles").select("id, display_name").in("id", actorIds)
      : { data: [] };
    const nameOf = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.display_name as string]));
    const label = (id: string) => nameOf.get(id) ?? "A member";

    const out: SocialNotif[] = [];

    for (const r of (replies ?? []) as any[]) {
      const parent = byId.get(r.parent_id);
      const snippet = String(r.body ?? "").trim() || "sent a GIF";
      out.push({
        id: `reply:${r.id}`,
        kind: "comment_reply",
        title: `${label(r.user_id)} replied to your comment`,
        subtitle: snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet,
        timestamp: r.created_at,
        href: hrefFor(r.event_kind ?? parent?.event_kind, r.event_id ?? parent?.event_id, r.id),
      });
    }

    // Group likes per comment so 8 likes read as one entry.
    const grouped = new Map<string, any[]>();
    for (const l of (likes ?? []) as any[]) {
      const arr = grouped.get(l.comment_id) ?? [];
      arr.push(l);
      grouped.set(l.comment_id, arr);
    }
    for (const [commentId, group] of grouped) {
      const parent = byId.get(commentId);
      if (!parent) continue;
      const newest = group[0];
      const others = group.length - 1;
      const snippet = String(parent.body ?? "").trim() || "your GIF";
      out.push({
        id: `like:${commentId}:${group.length}`,
        kind: "comment_like",
        title:
          others > 0
            ? `${label(newest.user_id)} and ${others} ${others === 1 ? "other" : "others"} liked your comment`
            : `${label(newest.user_id)} liked your comment`,
        subtitle: snippet.length > 90 ? `${snippet.slice(0, 90)}…` : snippet,
        timestamp: newest.created_at,
        href: hrefFor(parent.event_kind, parent.event_id, commentId),
      });
    }

    out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    return out.slice(0, 60);
  });
