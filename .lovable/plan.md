## Verification

Ivory Coast vs Norway final corner stats (from `match_stats`):
- Ivory Coast (home): **14 corners**
- Norway (away): **3 corners**
- **Total: 17 corners**

The bet `corners_over_under_9_5 / OVER_9_5` at odds 1.79, stake 200 → **17 > 9.5 → should be WON** (payout 358).
It was settled as **LOST**. This is incorrect — same class of bug as the previous Ivory Coast vs Norway mis-settlements (Under 3.5 goals, To Qualify Norway) that we just fixed.

## Root cause hypothesis

`settle_cards_corners_for_match` (in `settle_match_all_markets_atomic`) likely ran before `match_stats` had the final corner totals, or the corners settler falls through to a default LOST branch when stats are missing/zero. Because the previous fix only addressed goals/qualify markets settling to a legacy LOST default, corners/cards settlers still have the same shape of bug for this match.

## Plan

1. **Investigate the settler**
   - Read `settle_cards_corners_for_match` (Postgres function) to confirm whether it defaulted to LOST when `match_stats` was not yet populated at settlement time, or whether the totals it read were stale.
   - Check the settlement audit trail for this prediction to see what totals the function used.

2. **Reverse the mis-settled bet**
   - Migration that:
     - Refunds the house: debit platform bankroll 358, credit user `Bố Chiou` wallet 358 (net correction from LOST=0 to WON=358).
     - Updates the prediction row: `status = 'won'`, `points = 358`, add audit log entry citing manual correction.
   - Re-scan all predictions on `225d6ddf-4b05-40ec-81fd-13f65db0d826` for other corner/card markets that may have been mis-settled the same way, and correct them in the same migration.

3. **Fix the settler so this cannot recur**
   - In `settle_cards_corners_for_match`, if `match_stats` corner totals are NULL/0 for a match that is `finished`, **leave the bet pending** (do not default to LOST) and re-attempt on the next stats sync. Same guard for cards.
   - Add a small check: if home+away corners is 0 but the match has `finished` status and goals > 0, treat stats as "not yet ingested" and skip settlement for corner/card markets rather than grading them.

4. **Verify**
   - Re-run settlement for the match and confirm the corners_over_9_5 bet resolves to WON.
   - Query all `corners_*` and `cards_*` predictions for the last 7 days of finished matches and spot-check a handful against `match_stats`.

## Files / DB objects touched

- Migration: reverse mis-settlement + patch `settle_cards_corners_for_match` (and mirror the guard in the cards branch).
- No frontend changes.
