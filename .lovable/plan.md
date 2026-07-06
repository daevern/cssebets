## Problem

Brazil vs Norway ended 5–5 on corners (10 total). Two of Bố Chiou's bets were auto-settled on stale stats (3+4=7):

| Bet | Line | Actual (10) | Current | Correct |
|---|---|---|---|---|
| `corners_over_under_10_5` OVER, stake 100 @ 2.58 | needs ≥11 | 10 < 11 | lost | **lost** (unchanged) |
| `corners_over_under_9_5`  OVER, stake 150 @ 1.93 | needs ≥10 | 10 ≥ 10 | lost | **won**, payout 289.50 |

Only the OVER 9.5 bet is wrong. OVER 10.5 stays lost.

Corner stats in `match_stats` are already corrected to 5/5 (previous message). `matches.home_corners` / `away_corners` are `NULL`, so the settlement RPC now reads the correct totals — no risk of re-corruption.

## Fix

Targeted regrade for prediction `e2f85603-7f91-4ebe-87de-52a65fd12eb2` (Bố Chiou, user `7357dc15-673e-4d32-9d50-841cc71a292b`). All done in a single transactional data change:

1. Flip status `lost` → `won` on that one prediction.
   - The existing `predictions_accounting_trigger` auto-fills `gross_payout=289.50`, `net_profit=+139.50`, `house_profit_loss=-139.50`, and stamps `settled_result='won:corners_over_under_9_5'`, `settled_at=now()`.
2. Call `wallet_apply_change(user_id, 'credit', 289.50, 'bet_settlement', pred_id, 'Manual regrade: Brazil vs Norway corners corrected to 5-5', false)` to credit the payout to his real wallet and write a matching `wallet_transactions` row.
3. Insert an `audit_log` entry (`action='settlement_manual_regrade'`) linking the prediction, wallet transaction, and reason, so the correction is traceable.
4. Leave the OVER 10.5 prediction untouched.

No schema changes, no code changes, no re-run of `settle_cards_corners_for_match` (which would only touch pending rows anyway). No effect on any other Brazil vs Norway bets.

## Verification

After the change, query:
- `predictions` row shows `status='won'`, `gross_payout=289.50`, `net_profit=139.50`.
- Latest `wallet_transactions` row for that user is a `credit` of 289.50 with `reference_id = e2f85603…` and balance increased by 289.50.
- `audit_log` has the regrade entry.
- The user's "My Predictions" UI shows the 9.5 bet as won.
