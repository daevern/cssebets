## Goal
Reverse the auto-void refunds on druggie777's 6 UFC bets, restore them to pending, then grade against the real fight results and payout/settle.

## Context (from the ledger)
Six bets were refunded on 2026-07-19 12:45 UTC by the "provider_missing_method" sweep. They need to be un-refunded (debit the refund back) and re-graded once we have method + round for each fight. Two other bets on Duncan vs Cannonier (round r1 / r2) were cancelled earlier by the user himself — those stay as-is.

| Bet | Fight | Market · Pick | Stake | Odds | Winner in DB |
|-----|-------|---------------|-------|------|--------------|
| ac9254d3 | Montes vs McMillen | total_rounds · Over 2.5 | 19.14 | 3.04 | draw |
| 008d1ac5 | Delgado vs Bashi | round · Goes the distance | 69.00 | 2.00 | Delgado (a) |
| da3b70b2 | Delgado vs Bashi | total_rounds · Over 2.5 | 10.00 | 2.00 | Delgado (a) |
| 7f0c4d47 | Delgado vs Bashi | moneyline · Delgado | 10.00 | 1.99 | Delgado (a) |
| 9fb5cdc8 | Duncan vs Cannonier | total_rounds · Under 2.5 | 11.00 | 2.37 | Duncan (a) |
| 20df97d6 | Ramirez vs Hooper | round · Round 1 | 16.00 | 2.19 | Hooper (b) |

## Steps
1. Insert a `debit` wallet_transaction for each of the 6 refund rows (amount = original refund, note = "Reversal of auto-void — regrading with final result"), flipping bet status back to `open` and clearing `settled_at`/`payout`.
2. Grade each bet using the method + ending round you provide (see question below):
   - moneyline: pays if winner matches `selection_key`
   - round · rN: pays if method is KO/TKO/SUB and `result_round = N`
   - round · distance: pays if method is Decision (any)
   - total_rounds · over/under 2.5: over pays if fight ended in R3+ or went to decision; under pays if it ended in R1 or R2 by finish
3. For each bet: write the appropriate credit (win → `credit` for `potential_payout`; loss → no credit), set status to `won`/`lost`/`void`, and stamp `settled_at`.
4. Update `ufc_fights.result_method` / `result_round` for these four fights so future queries are consistent.
5. Verify druggie777's wallet balance matches the running ledger after the changes.

## Question I need answered before I can grade
The API-MMA feed didn't return method/round for these fights — that's why the sweep voided them. Please provide the final result for each (I'll do the math). Example format:

- Montes vs McMillen — Draw, went to decision (3 rounds)?
- Delgado vs Bashi — Delgado by KO R2 / SUB R1 / Decision?
- Duncan vs Cannonier — Duncan by KO R? / SUB R? / Decision?
- Ramirez vs Hooper — Hooper by KO R? / SUB R? / Decision?

Once you send those, I'll implement the reversal + regrade in one atomic migration and confirm the final wallet balance.

## Technical notes
- All wallet mutations go through `wallet_transactions` with correct `balance_before`/`balance_after` to keep the ledger consistent.
- Done as a single SQL migration so it's auditable and idempotent.
- No code changes to the auto-settle pipeline in this task (that's already been optimised for the paid API in the previous turn).