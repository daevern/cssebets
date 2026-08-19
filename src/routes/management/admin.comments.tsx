import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Trash2, ShieldBan, ShieldCheck } from "lucide-react";
import { useHasSession, withSession } from "@/hooks/use-staff-session";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adminListComments,
  adminDeleteComment,
  adminSetCommentBan,
} from "@/lib/comments.functions";

export const Route = createFileRoute("/management/admin/comments")({
  head: () => ({ meta: [{ title: "Comment moderation — Admin" }] }),
  component: CommentsModerationPage,
});

function CommentsModerationPage() {
  const hasSession = useHasSession();
  const qc = useQueryClient();
  const listFn = useServerFn(adminListComments);
  const delFn = useServerFn(adminDeleteComment);
  const banFn = useServerFn(adminSetCommentBan);

  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);

  const q = useQuery({
    queryKey: ["admin-comments", search, eventId, includeDeleted],
    queryFn: () =>
      withSession(() =>
        listFn({
          data: {
            search: search || undefined,
            eventId: eventId || undefined,
            includeDeleted,
            limit: 200,
          },
        }),
      ),
    enabled: hasSession === true,
    refetchInterval: 30_000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-comments"] });

  const del = useMutation({
    mutationFn: (commentId: string) => withSession(() => delFn({ data: { commentId } })),
    onSuccess: () => {
      toast.success("Comment removed");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });

  const ban = useMutation({
    mutationFn: (v: { userId: string; banned: boolean }) => withSession(() => banFn({ data: v })),
    onSuccess: (_d, v) => {
      toast.success(v.banned ? "User banned from commenting" : "Comment ban lifted");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  const rows = (q.data as any)?.comments ?? [];
  const stats = (q.data as any)?.stats ?? { today: 0, commenters: 0, deletedThisWeek: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Comment moderation</h1>
        <p className="text-sm text-muted-foreground">
          Recent comments across every match, race and fight.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Comments today</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{stats.today}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Active commenters</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{stats.commenters}</div>
        </Card>
        <Card className="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Deleted this week</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{stats.deletedThisWeek}</div>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search user or text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-56"
        />
        <Input
          placeholder="Event ID"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          className="max-w-72"
        />
        <Button
          variant={includeDeleted ? "default" : "outline"}
          size="sm"
          onClick={() => setIncludeDeleted((v) => !v)}
        >
          {includeDeleted ? "Showing deleted" : "Hiding deleted"}
        </Button>
      </div>

      {q.isLoading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No comments match those filters.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((c: any) => (
            <Card key={c.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold">{c.display_name}</span>
                <Badge variant="outline">{c.event_kind}</Badge>
                <span className="truncate text-muted-foreground">{c.event_id}</span>
                <span className="text-muted-foreground">
                  {new Date(c.created_at).toLocaleString()}
                </span>
                {c.parent_id && <Badge variant="secondary">reply</Badge>}
                {c.deleted_at && <Badge variant="destructive">deleted</Badge>}
                {c.banned && <Badge variant="destructive">banned</Badge>}
              </div>
              <p className="mt-1.5 whitespace-pre-wrap break-words text-sm">{c.body}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {!c.deleted_at && (
                  <Button size="sm" variant="outline" onClick={() => del.mutate(c.id)}>
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                )}
                <Button
                  size="sm"
                  variant={c.banned ? "outline" : "destructive"}
                  onClick={() => ban.mutate({ userId: c.user_id, banned: !c.banned })}
                >
                  {c.banned ? (
                    <>
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Unban
                    </>
                  ) : (
                    <>
                      <ShieldBan className="mr-1 h-3.5 w-3.5" /> Ban from commenting
                    </>
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground">{c.like_count} likes</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
