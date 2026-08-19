import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, MessageSquare, Trash2, Loader2, ImagePlay, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { avatarSrc, initialOf } from "@/lib/avatar";
import { GifPicker } from "@/components/social/GifPicker";
import type { GifResult } from "@/lib/gifs.functions";
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
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

const MAX = 500;
type Sort = "top" | "new";

function Avatar({
  name,
  userId,
  avatarPath,
}: {
  name: string;
  userId?: string | null;
  avatarPath?: string | null;
}) {
  const src = avatarSrc(userId, avatarPath);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-neon)]/15 text-sm font-semibold uppercase text-[var(--color-neon)]">
      {initialOf(name)}
    </span>
  );
}

function GifTile({ node }: { node: CommentNode }) {
  if (!node.mediaUrl) return null;
  const ratio =
    node.mediaWidth && node.mediaHeight ? `${node.mediaWidth} / ${node.mediaHeight}` : "4 / 3";
  return (
    <div className="relative mt-2 w-full max-w-[260px] overflow-hidden rounded-xl border border-[var(--color-surface-border)]/50">
      <img
        src={node.mediaUrl}
        alt="GIF"
        loading="lazy"
        className="w-full object-cover"
        style={{ aspectRatio: ratio }}
      />
      <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white">
        GIF
      </span>
    </div>
  );
}

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
  const [gif, setGif] = useState<GifResult | null>(null);
  const [focused, setFocused] = useState(false);
  const [pickerFor, setPickerFor] = useState<"root" | "reply" | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replyGif, setReplyGif] = useState<GifResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [sort, setSort] = useState<Sort>("new");

  const refresh = () => qc.invalidateQueries({ queryKey });

  const postMut = useMutation({
    mutationFn: (input: { body: string; parentId: string | null; media: GifResult | null }) =>
      post({
        data: {
          eventKind,
          eventId,
          body: input.body,
          parentId: input.parentId,
          media: input.media
            ? { url: input.media.url, width: input.media.width, height: input.media.height }
            : null,
        },
      }),
    onSuccess: () => {
      setBody("");
      setGif(null);
      setReplyBody("");
      setReplyGif(null);
      setReplyTo(null);
      setFocused(false);
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
  const sorted = useMemo(() => {
    const copy = [...roots];
    if (sort === "top") copy.sort((a, b) => b.likeCount - a.likeCount || b.createdAt.localeCompare(a.createdAt));
    else copy.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return copy;
  }, [roots, sort]);
  const visible = useMemo(() => (showAll ? sorted : sorted.slice(0, 10)), [sorted, showAll]);

  const canPostRoot = (!!body.trim() || !!gif) && !postMut.isPending;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold tracking-tight text-[var(--color-ink)] md:text-xl">
          {title}
          <span className="ml-2 text-sm font-medium text-[var(--color-ink-muted)]">
            {data?.total ?? 0}
          </span>
        </h2>
        <div className="flex items-center gap-1 rounded-full bg-white/[0.05] p-0.5">
          {(["top", "new"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold capitalize transition-colors ${
                sort === s ? "bg-[var(--color-neon)] text-black" : "text-[var(--color-ink-muted)]"
              }`}
            >
              {s === "top" ? "Top" : "Newest"}
            </button>
          ))}
        </div>
      </div>

      {/* Composer */}
      {isGuest ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3">
          <p className="text-sm text-[var(--color-ink-muted)]">Join the conversation.</p>
          <Link
            to="/auth"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--color-neon)] px-4 py-2 text-xs font-semibold text-black"
          >
            Sign in to comment
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-white/[0.03] p-3">
          <div className="flex items-start gap-3">
            <Avatar
              name={(user as any)?.user_metadata?.display_name ?? "You"}
              userId={user?.id}
              avatarPath={myAvatarPath}
            />
            <div className="min-w-0 flex-1">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX))}
                onFocus={() => setFocused(true)}
                rows={focused || body ? 3 : 1}
                placeholder="Add a comment…"
                className="w-full resize-none bg-transparent py-1.5 text-base leading-snug text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
              />
              {gif && (
                <div className="relative mt-1 w-32 overflow-hidden rounded-xl">
                  <img src={gif.previewUrl} alt="Selected GIF" className="w-full" />
                  <button
                    type="button"
                    onClick={() => setGif(null)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white"
                    aria-label="Remove GIF"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              {(focused || body || gif) && (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPickerFor("root")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-[11px] font-semibold text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
                    >
                      <ImagePlay className="h-4 w-4" /> GIF
                    </button>
                    <span className="text-[10px] tabular-nums text-[var(--color-ink-muted)]">
                      {body.length}/{MAX}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={!canPostRoot}
                    onClick={() => postMut.mutate({ body: body.trim(), parentId: null, media: gif })}
                    className="inline-flex h-9 items-center gap-2 rounded-full bg-[var(--color-neon)] px-4 text-xs font-semibold text-black disabled:opacity-40"
                  >
                    {postMut.isPending && !replyTo ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Post
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Thread */}
      {isLoading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--color-neon)]" />
        </div>
      ) : roots.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--color-ink-muted)]">
          No comments yet — start the conversation.
        </p>
      ) : (
        <div className="divide-y divide-[var(--color-surface-border)]/40">
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
                setReplyGif(null);
              }}
              replyOpen={replyTo === c.id}
              replySlot={
                <div className="mt-3 rounded-xl bg-white/[0.03] p-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value.slice(0, MAX))}
                    rows={2}
                    autoFocus
                    placeholder="Write a reply…"
                    className="w-full resize-none bg-transparent text-base leading-snug text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-muted)]"
                  />
                  {replyGif && (
                    <div className="relative mb-2 w-28 overflow-hidden rounded-lg">
                      <img src={replyGif.previewUrl} alt="Selected GIF" className="w-full" />
                      <button
                        type="button"
                        onClick={() => setReplyGif(null)}
                        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-black/70 text-white"
                        aria-label="Remove GIF"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPickerFor("reply")}
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/[0.06] px-3 text-[11px] font-semibold text-[var(--color-ink-muted)]"
                    >
                      <ImagePlay className="h-4 w-4" /> GIF
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setReplyTo(null)}
                        className="rounded-full px-3 py-2 text-[11px] text-[var(--color-ink-muted)]"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={(!replyBody.trim() && !replyGif) || postMut.isPending}
                        onClick={() =>
                          postMut.mutate({ body: replyBody.trim(), parentId: c.id, media: replyGif })
                        }
                        className="rounded-full bg-[var(--color-neon)] px-4 py-2 text-[11px] font-semibold text-black disabled:opacity-40"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                </div>
              }
            />
          ))}
          {sorted.length > visible.length && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full py-3 text-xs font-semibold text-[var(--color-neon)]"
            >
              Show {sorted.length - visible.length} more comments
            </button>
          )}
        </div>
      )}

      <GifPicker
        open={pickerFor !== null}
        onOpenChange={(v) => !v && setPickerFor(null)}
        onSelect={(g) => (pickerFor === "reply" ? setReplyGif(g) : setGif(g))}
      />
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
  const [showReplies, setShowReplies] = useState(false);

  return (
    <article className={`flex gap-3 py-3 ${nested ? "" : ""}`}>
      <Avatar name={node.displayName} userId={node.userId} avatarPath={node.avatarPath} />
      <div className="min-w-0 flex-1">
        <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-[var(--color-ink)]">{node.displayName}</span>
          {node.position && (
            <span className="rounded-full bg-[var(--color-neon)]/12 px-2 py-0.5 text-[10px] font-semibold text-[var(--color-neon)]">
              {node.position}
            </span>
          )}
          <span className="text-[11px] text-[var(--color-ink-muted)]">{relTime(node.createdAt)}</span>
        </header>

        {node.body && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-ink)]/90">
            {node.body}
          </p>
        )}
        <GifTile node={node} />

        <footer className="mt-1.5 flex items-center gap-1 text-[11px] text-[var(--color-ink-muted)]">
          <button
            type="button"
            onClick={() => onLike(node.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-full px-2 ${node.likedByMe ? "text-[var(--color-neon)]" : ""}`}
          >
            <Heart className={`h-4 w-4 ${node.likedByMe ? "fill-current" : ""}`} />
            {node.likeCount > 0 ? node.likeCount : ""}
          </button>
          {!nested && (
            <button
              type="button"
              onClick={() => onReply(node.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-2"
            >
              <MessageSquare className="h-4 w-4" /> Reply
            </button>
          )}
          {meId === node.userId && (
            <button
              type="button"
              onClick={() => onDelete(node.id)}
              className="inline-flex h-9 items-center gap-1.5 rounded-full px-2 hover:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </footer>

        {replyOpen && replySlot}

        {node.replies.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowReplies((v) => !v)}
              className="mt-1 text-[11px] font-semibold text-[var(--color-neon)]"
            >
              {showReplies
                ? "Hide replies"
                : `Show ${node.replies.length} ${node.replies.length === 1 ? "reply" : "replies"}`}
            </button>
            {showReplies && (
              <div className="mt-1 border-l border-[var(--color-surface-border)]/50 pl-3">
                {node.replies.map((r) => (
                  <CommentItem
                    key={r.id}
                    node={r}
                    meId={meId}
                    onLike={onLike}
                    onDelete={onDelete}
                    onReply={onReply}
                    nested
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
