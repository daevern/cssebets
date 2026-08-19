# Management console repair: missing bets, empty request queues, unreliable page loads

## What I verified in the live data

- Every new football bet (EPL, La Liga, Serie A) is written to the **new sports betting table** (`sports_bets`) — 10 rows, latest today 06:45 UTC, 9 still open.
- The **old predictions table** has had no new rows since 6 Aug. Admin bet screens, the operations dashboard and the admin home stats all read the old table (plus UFC and F1 tables) and **never read `sports_bets`**. That is exactly why "bets are being made but I don't see them in predictions".
- **Point requests**: the 5 outstanding rows are all in `pending_upload` state (user started a top-up but never uploaded proof). The admin list explicitly filters those out, so the queue looks empty. There are genuinely no new completed requests since 4 Aug, and 0 pending payouts, 0 pending user approvals.
- **32 management pages call server functions without the staff-session gate**, including Point Requests, Payouts, Users, Wallet adjustments, Staff, Settings, Bankroll, UFC and F1 admin. These fire before the auth token is ready and fail with "Unauthorized"/500 on first load — the source of the "lots of bugs in the admin page" feeling. Only a handful of pages (Operations, Review, Pulse) have the gate.

## What I will fix

### 1. Make admin see all bets again
- Add the new football bets source to the admin bet listing alongside predictions, UFC and F1, normalised to the same row shape (user, event, market, selection, stake, odds, potential payout, status, placed/settled time).
- Wire the sport filter so "football" covers both legacy predictions and new sports bets.
- Include them in the user detail drawer so a user's full bet history is complete.

### 2. Correct the numbers on Operations and the admin home
- Bets today / this week, stake volume, active users, last settlement and "failed settlement" checks currently count only the legacy table. Extend each to include new football bets plus UFC and F1, so counts, stake volume and health signals reflect real activity.
- Settlement monitor: add open bets on finished events from the new table to the stuck-settlement list.

### 3. Fix the request queues
- Point requests: add an "Awaiting proof" filter so `pending_upload` rows are visible (with an age column), instead of silently hidden. Default view stays actionable Pending.
- Show a clear empty-state message ("No requests in this state") so an empty queue is distinguishable from a failed load.
- Same empty/error states on payouts and pending-user approvals.

### 4. Stop the intermittent Unauthorized/500s across management
- Apply the existing staff-session gate pattern (`useHasSession` + `withSession`) to all management pages that call server functions but lack it, so queries only fire once the token exists and retry cleanly after refresh.
- Add a visible error state to those pages instead of an infinite spinner or blank card.

### 5. Sanity sweep
- After the changes, walk the management console page by page in a browser session and report which screens load clean, which show data, and anything still broken so nothing is silently missing.

## Technical notes

- Bet aggregation lives in `src/lib/admin-dashboard.functions.ts` (`listPredictionsAdmin`, `getUserDetail`) and `src/lib/operations.functions.ts` (`getOperationsDashboard`, `getSettlementMonitor`, activity report).
- New football bets: `public.sports_bets` (`sport_code`, `competition_code`, `market_key`, `selection_key`, `stake`, `accepted_odds`, `potential_payout`, `status` pending/won/lost/void, `placed_at`). Labels resolve via `sports_events` / `sports_markets` / `sports_market_selections`.
- Point request filter is the `.neq("status", "pending_upload")` in `adminListRequests` (`src/lib/wallet.functions.ts`); the status enum gains an `awaiting_upload` option rather than removing the filter.
- Session gating uses `src/hooks/use-staff-session.ts`, already proven on `admin.operations.tsx`.
- No schema migration required; read-path and UI changes only.
