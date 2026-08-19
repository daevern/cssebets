import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { CommentNode, EventKind } from "@/lib/comments.functions";

type Row = {
  id: string;
  body: string;
  created_at: string;
  user_id: string;
  parent_id: string | null;
  like_count: number;
  media_url: string | null;
  media_width: number | null;
  media_height: number | null;
};

async function loadPositions(kind: EventKind, eventId: string, userIds: string[]) {
  const map = new Map<string, string>();
  if (!userIds.length) return map;
  const db = supabaseAdmin as any;

  try {
    if (kind === "wc") {
      const { data } = await db
        .from("predictions")
        .select("user_id, selection_label, market_label, outcome")
        .eq("match_id", eventId)
        .in("user_id", userIds);
      for (const r of (data ?? []) as any[]) {
        if (!map.has(r.user_id)) map.set(r.user_id, r.selection_label || r.market_label || r.outcome);
      }
    } else if (kind === "football") {
      const { data } = await db
        .from("sports_bets")
        .select("user_id, selection_key, accepted_odds")
        .eq("sports_event_id", eventId)
        .in("user_id", userIds);
      for (const r of (data ?? []) as any[]) {
        if (!map.has(r.user_id)) {
          map.set(r.user_id, `${prettify(r.selection_key)} @ ${Number(r.accepted_odds).toFixed(2)}`);
        }
      }
    } else if (kind === "f1") {
      const { data } = await db
        .from("f1_bets")
        .select("user_id, selection_label, odds_locked")
        .eq("race_id", eventId)
        .in("user_id", userIds);
      for (const r of (data ?? []) as any[]) {
        if (!map.has(r.user_id)) {
          map.set(r.user_id, `${r.selection_label} @ ${Number(r.odds_locked).toFixed(2)}`);
        }
      }
    } else {
      const { data } = await db
        .from("ufc_bets")
        .select("user_id, selection_label, odds_locked")
        .eq("fight_id", eventId)
        .in("user_id", userIds);
      for (const r of (data ?? []) as any[]) {
        if (!map.has(r.user_id)) {
          map.set(r.user_id, `${r.selection_label} @ ${Number(r.odds_locked).toFixed(2)}`);
        }
      }
    }
  } catch {
    return map;
  }
  return map;
}

function prettify(key: string) {
  return String(key ?? "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function listCommentsForEvent(
  kind: EventKind,
  eventId: string,
  viewerId: string | null,
): Promise<{ comments: CommentNode[]; total: number }> {
  const db = supabaseAdmin as any;
  const { data, error } = await db
    .from("event_comments")
    .select("id, body, created_at, user_id, parent_id, like_count, media_url, media_width, media_height")
    .eq("event_kind", kind)
    .eq("event_id", eventId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as Row[];
  if (!rows.length) return { comments: [], total: 0 };

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const [{ data: profiles }, positions, likedIds] = await Promise.all([
    db.from("profiles").select("id, display_name").in("id", userIds),
    loadPositions(kind, eventId, userIds),
    viewerId
      ? db
          .from("event_comment_likes")
          .select("comment_id")
          .eq("user_id", viewerId)
          .in(
            "comment_id",
            rows.map((r) => r.id),
          )
          .then((res: any) => new Set(((res.data ?? []) as any[]).map((l) => l.comment_id)))
      : Promise.resolve(new Set<string>()),
  ]);

  const names = new Map(((profiles ?? []) as any[]).map((p) => [p.id, p.display_name as string]));

  const toNode = (r: Row): CommentNode => ({
    id: r.id,
    body: r.body,
    createdAt: r.created_at,
    userId: r.user_id,
    displayName: names.get(r.user_id) ?? "Member",
    likeCount: r.like_count ?? 0,
    likedByMe: (likedIds as Set<string>).has(r.id),
    position: positions.get(r.user_id) ?? null,
    mediaUrl: r.media_url ?? null,
    mediaWidth: r.media_width ?? null,
    mediaHeight: r.media_height ?? null,
    replies: [],
  });

  const nodes = new Map<string, CommentNode>();
  for (const r of rows) nodes.set(r.id, toNode(r));

  const roots: CommentNode[] = [];
  for (const r of rows) {
    const node = nodes.get(r.id)!;
    if (r.parent_id && nodes.has(r.parent_id)) nodes.get(r.parent_id)!.replies.push(node);
    else if (!r.parent_id) roots.push(node);
  }
  for (const n of nodes.values()) {
    n.replies.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return { comments: roots, total: rows.length };
}
