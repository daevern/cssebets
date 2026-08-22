# Fix: winning football bets never auto-settle

## What's actually wrong

Confirmed by inspecting the live database, not guessed.

The Arsenal vs Coventry fixture (3-0, status `finished`) has a valid result row and the auto-settle cron runs every ~2 minutes and reports "success" — but with `markets_settled = 0` every single time. Two markets are stuck: `match_result` and `total_goals_2_5`. The `btts` market on the same fixture settled fine.

The difference between them is the giveaway: **btts lost, the other two would pay out.**

The settlement routine `settle_sports_market_atomic` writes a wallet transaction whenever money moves. For a winning bet it writes `reference_type = 'bet_payout'`, and for a voided bet `'bet_refund'`. Neither of those values exists in the `wallet_ref_type` list the column accepts (the allowed values are `point_request`, `bet_placement`, `bet_settlement`, `admin_adjustment`, `house_bankroll`, `payout`). So the insert throws, the whole market's settlement transaction rolls back, and nothing is recorded — no journal row, no bet update, no market update.

Losing bets never insert a wallet transaction, so they settle normally. That is exactly why one ticket is graded "lost" and the two potential winners are still "pending".

Second problem that hid this for hours: the settlement code ignores the error. It does `if (error) continue`, and in the void branch it doesn't even read the error. So each cron run logs a clean 200 with zero markets settled and no warning anywhere.

## The fix

1. **Database migration** — correct the wallet-transaction reference type inside `settle_sports_market_atomic`: use `bet_settlement` for both the payout credit and the refund credit (matching every other settlement write in the system), keeping the existing note/category fields so history stays readable.

2. **Stop swallowing failures** — in `src/features/football/services/footballSettlement.server.ts`:
   - capture the error on all three settlement calls (win, void-by-decision, void-by-missing-selection),
   - collect failures into a list,
   - finish the run with status `failed` and the error text in `notes` when any market failed, instead of always writing `success`,
   - log a warning line per failed market so it shows up in server logs.

3. **Clear the backlog** — after the migration, the existing 2-minute cron re-attempts these markets automatically and settles them on its next pass. Currently only 3 pending bets across 2 finished fixtures are affected, so no bulk backfill script is needed; I'll verify the tickets flip to won/lost and the wallet credits land.

4. **Verify** — re-query the affected fixture: markets `settled`, bets no longer `pending`, `wallet_transactions` rows written with `bet_settlement`, liability reservations released, and the settlement run reporting non-zero counts.

## Notes

- No other database function uses the invalid reference types, so this is limited to sports market settlement (football, UFC and F1 all route through this same RPC, so they were all affected for winning bets).
- No change to grading logic — the scores and winning selections were already computed correctly (`match_result` → home, `total_goals_2_5` → over).
