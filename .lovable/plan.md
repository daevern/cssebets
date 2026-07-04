## Goal

1. Stop the settlement bug that credited/debited wallets against extra-time aggregate scores instead of regulation, and stop the reversal thrash that repeatedly credited then debited the same amount.
2. Add a **username filter** to the admin Wallet Ledger.

**Wallet balances are not touched.** No `wallet_transactions`, `predictions`, or bankroll changes. The fix is forward-only.

## Root cause (short)

`src/lib/apifootball-analytics.server.ts → syncScore` writes API-Football's `fx.goals.home/away` straight into `matches.home_score/away_score`. `goals.*` is the running aggregate — during and after extra time it holds the ET score (e.g. Argentina/Cape Verde 3-2), not the 90-minute regulation score (1-1). Every score change triggers `matches_score_change_guard`, which reverses the prior settlement and re-settles against the wrong score. When the live endpoint returned inconsistent aggregate values, the same bet was reversed and re-credited every ~2 minutes (14 credits / 13 debits on bet `d748becd` in druggie777's ledger).

The football-data path already reads `score.regularTime` correctly. Only the API-Football path is broken.

## Changes

### 1. `src/lib/apifootball-analytics.server.ts` — `syncScore`

- Derive regulation from `fx.score.fulltime.home/away` for `home_score/away_score`.
- Keep `fx.goals.home/away` (the aggregate) in `ft_home_score/ft_away_score` — this is the correct "final incl. ET" field already used elsewhere.
- Never overwrite `home_score/away_score` once the match is `finished` unless the new regulation value comes from `score.fulltime` AND differs by something other than an ET/live flap: if `score.fulltime` is null on a finished payload, skip the score update entirely (previous value stays).
- Continue writing `penalty_home_score/away_score` from `score.penalty`.
- Also set `qualifier` from `score.winner`/penalties when the match finishes in a knockout stage, mirroring the football-data path — this keeps the `to_qualify` market graded on who actually advanced.

### 2. `src/lib/settlement.server.ts` — defensive guard

Add a pre-flight in `settlePredictionsForMatch`: read `matches.ft_home_score/ft_away_score` and, when both `home_score` and `ft_home_score` are set and they differ, ensure the caller is passing the regulation score (`home_score`, not `ft_home_score`). If a caller ever passes the ET aggregate for a match that went to ET, throw and log — this catches regressions before any wallet write. No behaviour change today because all current callers already pass `matches.home_score`.

### 3. Operational alert on divergence

Add an `operational_alerts` insert (severity `high`, category `settlement`) whenever a live/finished sync detects `home_score IS DISTINCT FROM ft_home_score` on a match that already has settled predictions — flags human-review-worthy data drift without touching wallets.

### 4. Admin Wallet Ledger — username filter

- `src/lib/admin-dashboard.functions.ts → listWalletLedgerAdmin`: accept an optional `username` (string, min 2). Resolve it to a set of `user_id`s by `ilike '%username%'` on `profiles.display_name` (server-side, admin client), then apply `.in('user_id', ids)` to the ledger query. Keeps the existing `userId` UUID filter working.
- `src/routes/management/admin.wallet-ledger.tsx`: add a "Filter by username" `Input` next to the existing UUID input, wired into the query key. Empty input = no filter. CSV export continues to reflect the currently filtered rows.

## Out of scope (explicit)

- No changes to `wallet_transactions`, `wallets.balance`, `predictions`, `platform_bankroll`, or any user's numbers.
- No changes to `matches_score_change_guard` or `reverse_settled_predictions_for_match` — with the source fixed, the guard behaves correctly (flips only on genuine regulation-score corrections).
- The settlement thrash on already-affected bets stays in the ledger as historical record.

## Verification

- Manually invoke `syncScore` for a known ET match (Argentina/Cape Verde, Belgium/Senegal) via the admin control and confirm `matches.home_score` = 1/2 and `ft_home_score` = 3/3 after the run.
- Open Admin → Wallet Ledger, type "druggie" in the new username field, confirm only druggie777's rows appear.
- Confirm no new `wallet_transactions` rows are written by any of these changes (they are read-only for wallets).
