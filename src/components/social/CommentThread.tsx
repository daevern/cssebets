import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MessageSquare, Trash2, Loader2, CornerDownRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  listEventComments,
  postEventComment,
  toggleCommentLike,
  deleteMyComment,
  type CommentNode,
  type EventKind,
} from "@/lib/comments.functions";

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const MAX = 500;

export function CommentThread({
  eventKind,
  eventId,
  title = "Comments",
}: {
  eventKind: EventKind;
  eventId: string;
  title?: string;
}) {
  const { user } = useAuth();
  const isGuest = !user || (user as any).is_anonymous === true;
  const qc = useQueryClient();

  const list = useServerFn(listEventComments);
  const post = useServerFn(postEventComment);
  const like = useServerFn(toggleCommentLike);
  const remove = useServerFn(deleteMyComment);

  const queryKey = ["event-comments", eventKind, eventId, user?.id ?? "anon"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () =>
      list({ data: { eventKind, eventId, viewerId: isGuest ? undefined : user?.id } }) as Promise<{
        comments: CommentNode[];
        total: number;
      }>,
    refetchInterval: 20_000,
  });

  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [showAll, setShowAll] = useState(false);

  const refresh = () => qc.invalidateQueries({ queryKey });

  const postMut = useMutation({
    mutationFn: (input: { body: string; parentId: string | null }) =>
      post({ data: { eventKind, eventId, body: input.body, parentId: input.parentId } }),
    onSuccess: () => {
      setBody("");
      setReplyBody("");
      setReplyTo(null);
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "Couldn't post that comment."),
  });

  const likeMut = useMutation({
    mutationFn: (commentId: string) => like({ data: { commentId } }),
    onSuccess: refresh,
    onError: () => toast.error("Couldn't register that like."),
  });

  const deleteMut = useMutation({
    mutationFn: (commentId: string) => remove({ data: { commentId } }),
    onSuccess: () => {
      toast.success("Comment deleted");
      refresh();
    },
    onError: () => toast.error("Couldn't delete that comment."),
  });

  const roots = data?.comments ?? [];
  const visible = useMemo(() => (showAll ? roots : roots.slice(0, 10)), [roots, showAll]);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] md:text-xl">
          {title}
        </h2>
        <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">
          {data?.total ?? 0} {data?.total === 1 ? "comment" : "comments"}
        </span>
      </div>

      {/* Composer */}
      {isGuest ? (
        <div className="rounded-2xl border border-[var(--color-surface-border)]/60 bg-white/[0.02] p-4 text-center">
          <p className="text-sm text-[var(--color-ink-muted)]">
            Join the conversation with other traders.
          </p>
          <Link
            to="/auth"
            className="mt-3 inline-flex items-center justify-center rounded-full bg-[var(--color-neon)] px-5 py-2 text-xs font-semibold text-black"
          >
            Sign in to comment
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-surface-border)]/60 bg-white/[0.02] p-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, MAX))}
            rows={3}
            placeholder="Share your read on this market…"
            className="w-full resize-none bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
          />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[10px] tabular-nums text-[var(--color-ink-muted)]">
              {body.length}/{MAX}
            </span>
            <button
              type="button"
              disabled={!body.trim() || postMut.isPending}
              onClick={() => postMut.mutate({ body: body.trim(), parentId: null })}
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-neon)] px-4 py-1.5 text-xs font-semibold text-black disabled:opacity-40"
            >
              {postMut.isPending && !replyTo ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Post
            </button>
          </div>
        </div>
      )}

      {/* Thread */}
      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-neon)]" />
        </div>
      ) : roots.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--color-surface-border)]/60 px-4 py-8 text-center text-sm text-[var(--color-ink-muted)]">
          No comments yet — start the conversation.
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => (
            <CommentItem
              key={c.id}
              node={c}
              meId={isGuest ? null : (user?.id ?? null)}
              onLike={(id) => (isGuest ? toast.info("Sign in to like comments.") : likeMut.mutate(id))}
              onDelete={(id) => deleteMut.mutate(id)}
              onReply={(id) => {
                if (isGuest) return toast.info("Sign in to reply.");
                setReplyTo(replyTo === id ? null : id);
                setReplyBody("");
              }}
              replyOpen={replyTo === c.id}
              replySlot={
                <div className="mt-3 rounded-xl border border-[var(--color-surface-border)]/60 bg-white/[0.02] p-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value.slice(0, MAX))}
                    rows={2}
                    autoFocus
                    placeholder="Write a reply…"
                    className="w-full resize-none bg-transparent text-sm text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="rounded-full px-3 py-1 text-[11px] text-[var(--color-ink-muted)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!replyBody.trim() || postMut.isPending}
                      onClick={() => postMut.mutate({ body: replyBody.trim(), parentId: c.id })}
                      className="rounded-full bg-[var(--color-neon)] px-3 py-1 text-[11px] font-semibold text-black disabled:opacity-40"
                    >
                      Reply
                    </button>
                  </div>
                </div>
              }
            />
          ))}
          {roots.length > visible.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full rounded-full border border-[var(--color-surface-border)]/60 py-2 text-xs font-medium text-[var(--color-ink-muted)]"
            >
              Show {roots.length - visible.length} more
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function CommentItem({
  node,
  meId,
  onLike,
  onDelete,
  onReply,
  replyOpen,
  replySlot,
  nested = false,
}: {
  node: CommentNode;
  meId: string | null;
  onLike: (id: string) => void;
  onDelete: (id: string) => void;
  onReply: (id: string) => void;
  replyOpen?: boolean;
  replySlot?: React.ReactNode;
  nested?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border border-[var(--color-surface-border)]/50 bg-white/[0.02] p-3 ${nested ? "ml-5" : ""}`}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-[var(--color-ink)]">{node.displayName}</span>
        {node.position && (
          <span className="rounded-full bg-[var(--color-neon)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-neon)]">
            Backing {node.position}
          </span>
        )}
        <span className="text-[10px] text-[var(--color-ink-muted)]">{relTime(node.createdAt)}</span>
      </header>

      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-ink)]/90">
        {node.body}
      </p>

      <footer className="mt-2 flex items-center gap-4 text-[11px] text-[var(--color-ink-muted)]">
        <button
          type="button"
          onClick={() => onLike(node.id)}
          className={`inline-flex items-center gap-1 ${node.likedByMe ? "text-[var(--color-neon)]" : ""}`}
        >
          <Heart className={`h-3.5 w-3.5 ${node.likedByMe ? "fill-current" : ""}`} />
          {node.likeCount > 0 ? node.likeCount : "Like"}
        </button>
        {!nested && (
          <button type="button" onClick={() => onReply(node.id)} className="inline-flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" /> Reply
          </button>
        )}
        {meId === node.userId && (
          <button
            type="button"
            onClick={() => onDelete(node.id)}
            className="inline-flex items-center gap-1 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        )}
      </footer>

      {replyOpen && replySlot}

      {node.replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-[var(--color-surface-border)]/40 pl-2">
          {node.replies.map((r) => (
            <div key={r.id} className="flex gap-1">
              <CornerDownRight className="mt-3 h-3 w-3 shrink-0 text-[var(--color-ink-muted)]" />
              <div className="flex-1">
                <CommentItem node={r} meId={meId} onLike={onLike} onDelete={onDelete} onReply={onReply} nested />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
