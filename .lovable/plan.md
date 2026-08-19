# Leaderboards, Weekly Prizes & Match Comments

Two features: a competitive leaderboard with automatic prize payouts, and a Kalshi-style comment thread on every sports market page.

## 1. Leaderboard

### Ranking
Users are ranked by **total winning tickets** in the period — settled wins across World Cup predictions, football, F1, UFC and arcade rounds. Ties broken by net profit, then by earliest first win.

### Boards
- **Daily** — resets 00:00 UTC. Shows top 25.
- **Weekly** — Monday 00:00 UTC to Sunday 23:59 UTC. Shows top 50.
- **All-time** — lifetime wins, no prizes, purely for status.

Each row: rank, avatar/initial, display name, wins, net P/L, win rate. The signed-in user's own row is pinned at the bottom if outside the visible range, with their exact rank.

### Prizes
| Board | Place | Reward |
|---|---|---|
| Daily | 1st | 25 CSSE tokens |
| Weekly | 1st | 100 points + 200 tokens |
| Weekly | 2nd | 50 points + 100 tokens |
| Weekly | 3rd | 25 points + 50 tokens |

Rules:
- Minimum 3 settled tickets in the period to be eligible for a prize (blocks empty-board wins).
- Payouts run automatically on a schedule (daily just after midnight UTC, weekly just after Monday midnight UTC), and are idempotent — a period can never pay out twice.
- Points land in the user's wallet as a system credit labelled "Leaderboard prize — week of X"; tokens land in the CSSE token wallet. Both appear in the user's existing transaction history.
- Demo/guest accounts are excluded.
- A winner gets a notification (in-app + push if enabled) when a prize lands.

### Where it appears
- New page `/leaderboard` with Daily / Weekly / All-time tabs, a prize-pool banner, and a countdown to the next payout.
- Compact "Top 5 this week" card on the dashboard linking to the full board.
- Past winners strip showing the last few weeks' top 3 — social proof.

### Admin
New Management page section: current standings preview, prize configuration (amounts per place, minimum-ticket threshold, on/off toggle), payout history log, and a manual "run payout now" button for the current period with a confirmation step.

## 2. Comments on sports pages

A comment thread under the markets on every match/race/fight page (football, World Cup, F1, UFC).

- **Read:** anyone, including demo visitors — comments are visible without signing in for social proof.
- **Post:** signed-in accounts only. Guests see the thread plus a "Sign in to comment" prompt.
- Newest-first list, 500-character limit, display name + relative timestamp, live-ish refresh.
- One level of replies, plus a like/upvote per comment (one per user).
- Optional badge next to a commenter who has an open position on that market ("holds YES @ 62c" style) — Kalshi's key social-proof touch, derived from their existing bet on that event.
- Users can delete their own comments; admins can delete any and can ban a user from commenting.
- Rate limit: max 5 comments per minute per user; basic profanity/spam filter.

Admin gets a moderation view: recent comments across all events, filter by user/event, delete, and comment-ban toggle.

## Technical notes

**Database**
- `leaderboard_periods` (kind daily/weekly, start/end, status, paid_at) and `leaderboard_prizes` (period, user, rank, points_awarded, tokens_awarded) — the prize table's unique key on (period, rank) is what makes payouts idempotent.
- `leaderboard_settings` — configurable prize amounts and eligibility threshold, admin-writable only.
- A SQL function aggregates wins per user for a time window by unioning settled `predictions`, `sports_bets`, `f1_bets`, `f1_championship_bets`, `ufc_bets` and arcade round tables; materialised into `leaderboard_snapshots` refreshed every few minutes so the page never runs the heavy union on request.
- `event_comments` (event_kind, event_id, user_id, body, parent_id, deleted_at) and `event_comment_likes`. Public `TO anon` SELECT on non-deleted rows; insert/update scoped to `auth.uid()`; admin policies via `has_role`.
- `profiles` gains a `comments_banned_at` column.
- All new public tables get GRANTs alongside RLS.

**Payouts**
- A `SECURITY DEFINER` RPC awards prizes in one transaction: closes the period, writes prize rows, credits `wallet_transactions` (ref_type `admin_adjustment`, system actor) and `csse_token_transactions`, and queues notifications. Existing direct wallet adjustment is maker-checker gated, so this system path is a separate audited function rather than reusing that flow.
- Triggered by a cron job hitting a new `/api/public/hooks/leaderboard-payout` route protected by the existing cron secret; the RPC is safe to call repeatedly.

**Frontend**
- `src/lib/leaderboard.functions.ts` (public read fn for the board, authed fn for "my rank", admin fns) and `src/lib/comments.functions.ts`.
- `src/routes/leaderboard.tsx` (public read) + dashboard card; `src/components/social/CommentThread.tsx` mounted in the shared `MatchAnalyticsScreen` so football, World Cup, F1 and UFC pages all get it from one change.
- Mobile-first: single-column board rows, sticky tab bar, comment composer docked above the bottom nav.
