# Match Comments (Kalshi-style social layer)

A comment thread under the markets on every event page — World Cup matches, club football, F1 races and UFC fights. Leaderboard/prizes are deferred to a later change.

## Behaviour

- **Read:** anyone, including demo/guest visitors. Comments render without signing in, for social proof.
- **Post:** signed-in accounts only. Guests see the full thread plus a "Sign in to comment" prompt that opens the existing sign-up sheet.
- Newest-first list, 500-character limit, display name + relative timestamp ("4m ago").
- Live-ish refresh: poll every 20s, plus immediate refresh after posting.
- **One level of replies** — a reply opens an inline composer under the parent and renders indented beneath it. No deeper nesting.
- **Likes:** one per user per comment, toggleable, with a count.
- **Position badge:** if the commenter has a bet on that event, show a small chip next to their name (e.g. "Backing Arsenal @ 1.85"). Derived from their own settled/open ticket on that event; hidden if they have none.
- **Deletion:** users delete their own comments (shown as "comment deleted" if it has replies, otherwise removed). Admins delete any comment.
- **Comment ban:** admins can ban a user from commenting; banned users see a notice instead of the composer.
- **Rate limit:** 5 comments per minute per user, enforced server-side through the existing rate-limit helper.
- **Spam filter:** basic profanity list plus blocks on links, all-caps spam and repeated identical posts.

## Where it appears

- Directly below the markets section on the shared World Cup / football match screen.
- Same component mounted on the F1 race page and the UFC fight page (those pages don't share the match screen, so they get the component added individually).
- Empty state: "No comments yet — start the conversation."
- Mobile-first: single-column thread, composer docked above the bottom nav with safe-area padding, thread collapses to the latest 10 with a "Show more" control.

## Admin moderation

New Management page (`/management/admin/comments`):
- Recent comments across all events, newest first.
- Filters: by user, by event, and hide/show already-deleted.
- Actions: delete a comment, and toggle a comment ban on the author.
- Shows counts: comments today, active commenters, deleted this week.

## Technical notes

**Database (one migration)**
- `event_comments` — `id`, `event_kind` (`wc` | `football` | `f1` | `ufc`), `event_id`, `user_id`, `body`, `parent_id` (self-reference, one level enforced by a trigger), `deleted_at`, `deleted_by`, `like_count`, `created_at`, `updated_at`.
- `event_comment_likes` — `comment_id`, `user_id`, unique on the pair; a trigger maintains `like_count`.
- `profiles.comments_banned_at` (nullable timestamp) plus `comments_banned_by`.
- RLS: `TO anon, authenticated` SELECT on rows where `deleted_at is null`; INSERT/UPDATE/DELETE scoped to `auth.uid() = user_id`; admin full access via `has_role`. GRANTs issued for `anon` (select), `authenticated` (select/insert/update/delete), `service_role` (all), matching the policies.
- Indexes on `(event_kind, event_id, created_at desc)` and `(user_id, created_at desc)`.
- `updated_at` trigger reusing the existing helper.

**Server functions** — `src/lib/comments.functions.ts`
- `listEventComments` — public (server publishable client, anon policy), returns threaded comments with author display name, like count, whether the current viewer liked it, and the position badge data.
- `postEventComment`, `toggleCommentLike`, `deleteMyComment` — authed via `requireSupabaseAuth`; post path checks the comment ban, runs the rate limit (new `comment_post` action, fail-open) and the spam filter.
- `adminListComments`, `adminDeleteComment`, `adminSetCommentBan` — admin-gated with the existing role check pattern.

**Frontend**
- `src/components/social/CommentThread.tsx` (thread + composer + reply/like controls) and a small `CommentItem` child.
- Mounted in `MatchAnalyticsScreen` (covers World Cup + club football in one change) and added to `F1RaceDetailsPage` and the UFC fight page.
- New admin route `src/routes/management/admin.comments.tsx`, linked from the management nav.
