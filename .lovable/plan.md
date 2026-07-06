## Why the three bets are still PENDING

The Portugal vs Spain match is `status = 'finished'` with a final score, but the three tickets are on **cards / corners** markets, which are settled by the DB function `settle_cards_corners_for_match`, not the main score settler.

That function requires **both** teams' stats to be present and fresh before it will grade any card/corner bet. For this match the data is missing:

- `matches.home_corners`, `matches.away_corners`, `matches.home_cards`, `matches.away_cards` are all NULL.
- `match_stats` has only a **home** row (corners = 3, cards NULL). No `away` row exists.
- `match_events` contains only 4 `subst` events — no `Card` or `Corner` events, so we can't derive stats from events either.

Result: `v_stats_fresh = false` → the loop hits `CONTINUE` for every pending card/corner prediction → they stay PENDING forever, even though the match is over.

Root cause: after full-time, `syncStats` (the API-Football statistics fetch that writes `match_stats` and mirrors `home/away_corners` + `home/away_cards` onto `matches`) either never ran for this fixture or returned a partial payload (home only, no cards). The fulltime webhook path finalizes the score but does not guarantee a completed stats sync, and there is no retry / catch-up job for stats or a timeout that voids stale card/corner bets.

## Fix (three layers)

### 1. Immediate: unblock these three tickets
- Add an **admin action** on `/management/admin/matches` (per match): "Resync stats & settle cards/corners". Calls a new server fn that:
  1. Runs `syncStats(matchId)` (both sides, cards + corners).
  2. Mirrors the resulting totals onto `matches.home_corners / away_corners / home_cards / away_cards` if still NULL.
  3. Invokes `settle_cards_corners_for_match(matchId)` and returns the count settled.
- If API-Football has no stats for the fixture, the admin can enter final `home_corners / away_corners / home_cards / away_cards` manually in the same panel, then click Settle. This voids nothing — it grades on the entered numbers.

### 2. Auto catch-up so it stops recurring
- Extend the existing `settleFinishedPending` catch-up (already polled every 30 s from `my-predictions.tsx`) to also:
  - For any finished match with pending cards/corners bets and missing/partial stats, call `syncStats(matchId)` (rate-limited, once per match per interval) before calling `settle_cards_corners_for_match`.
- Add a scheduled server route (`/api/public/hooks/reconciliation` already exists) task that does the same sweep every few minutes, so it works even when no user has the Picks page open.

### 3. Safety net: auto-void after N hours
- If stats are still incomplete **X hours** after `finished_at` (default 6 h, configurable in `platform_settings`), the settler voids pending card/corner bets for that match and refunds stakes — instead of leaving them PENDING indefinitely.
- Log each auto-void to `audit_log` and `operational_alerts` (severity: `medium`) so admins are notified.

## Not in scope
- Changing how score-based markets settle (they already work — Portugal 0-1 Spain is graded).
- Rewriting the API-Football sync pipeline.
- Any UI change to `my-predictions.tsx` beyond the existing catch-up hook.

## Technical notes / files

- **DB migration**: bump `settle_cards_corners_for_match` to (a) accept an "auto-void stale" branch keyed on `finished_at + interval` from a settings value, (b) fall back to `matches.*` columns when only one `match_stats` side exists but the mirrored column is populated.
- **New server fn** `resyncStatsAndSettle(matchId)` in `src/lib/settle-catchup.functions.ts` — protected by `requireSupabaseAuth` + admin role check; calls `syncStats` (from `apifootball-analytics.server.ts`) then the DB function.
- **Admin UI**: add a button to the per-match row in `src/routes/management/admin.matches.tsx` (or the match detail view if that's where settlement controls live), plus four number inputs for manual override.
- **Catch-up**: update `settleFinishedPending` in `src/lib/settle-catchup.functions.ts` to trigger `syncStats` when needed. Update `src/routes/api/public/hooks/reconciliation.ts` to run the same sweep on cron.
- **Setting**: add `cards_corners_void_after_hours` (int, default 6) to `platform_settings`.
