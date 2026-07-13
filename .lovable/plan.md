## Why users can currently bet the same market twice

Two things combined:

1. `platform_settings.max_bets_per_user_per_match` is set to `0` — which the guard treats as "unlimited pending bets per match".
2. Even when that setting is > 0, the guard only counts total pending bets on a match. It never checked `(market, outcome)`, so a user could stake AWAY twice as long as they stayed under the total cap.

There is no rule anywhere that says "one bet per market/selection per user per match", so nothing actually changed in code — the safeguard the user expects was never enforced at the DB level.

## Fix

Add a hard rule: **one pending bet per (user, match, market, outcome)**. Applies to football only (predictions table); UFC is out of scope for this change.

### Steps

1. **Migration** — extend `public.assert_betting_allowed` to add, before the existing count check:
   - `SELECT 1 FROM predictions WHERE user_id = p_user_id AND match_id = p_match_id AND market = p_market::prediction_market AND outcome = p_outcome AND status = 'pending'`
   - If found, `RAISE EXCEPTION 'DUPLICATE_SELECTION'`.
   - Requires adding `p_outcome text` parameter to `assert_betting_allowed` and updating the single call site inside `place_bet_atomic` to pass `p_outcome`.
   - Keep `max_bets_per_user_per_match` behavior unchanged.

2. **Server error mapping** in `src/lib/predictions.functions.ts` — map `DUPLICATE_SELECTION` to a user-facing message: "You already have a pending bet on this selection."

### Notes

- Settled/lost/won/void bets are not counted — a user can re-bet the same selection on a future match, or re-bet after a previous one was voided.
- This does not restrict "different selections in the same market" (e.g. HOME and DRAW on Result), only the exact same market + selection.
- No UI changes; the existing error toast surface handles the new message.
