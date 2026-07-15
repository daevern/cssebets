
## Accounting audit — current state

**Test user identified:** `daevernganendrah31@gmail.com` → user_id `79b6a2c9-8ed2-45ba-8ef6-c24620a0c410`

### Test user footprint (to be removed)

| Table | Rows | Notes |
|---|---|---|
| `predictions` | 81 | 45 non-sim (9 won, 11 lost, 36 void, 1 pending), 24 sim |
| `ufc_bets` | 2 | 1 won (15.10 payout), 1 void |
| `wallet_transactions` | 179 | credit/debit/refund history |
| `wallets` | 1 | balance 1,502.33 (flagged sim) |
| `payout_requests` | 8 | 6 completed (615.67), 1 uploaded (100), 1 rejected (125) |
| `point_requests` | 7 | totalling 3,550 pts |

### Realized house PnL — everything else

Excludes the test user and any `is_simulation = true` rows.

**Football predictions (settled)**
- Won: 141 tickets, stakes 13,108.33 → paid out 32,050.01
- Lost: 385 tickets, stakes 22,499.58 → paid out 0
- Void: 45 tickets, stakes 788.80 → refunded 788.80 (PnL neutral)
- Stakes collected: **36,396.71** · Payouts paid: **32,838.81**
- **House PnL: +3,557.90 pts**

**UFC bets (settled)**
- Won: 3 tickets, stakes 140.80 → paid 358.71
- Lost: 1 ticket, stake 10.00
- **House PnL: −207.91 pts**

**Combined realized house PnL: +3,349.99 pts**

Open liability from non-test, non-sim pending tickets: **0** (nothing outstanding).

### Bankroll reconciliation

`platform_bankroll` (live) currently shows:
- balance 57,465.00 · stakes_collected 39,451.71 · payouts_paid 30,678.31 (recorded PnL 8,773.40)

Those totals include the test user's activity (stakes 3,055.00, payouts ~3,347 across football + UFC) plus what looks like a seeded opening balance. After the cleanup the totals will be restated from the surviving settled rows.

---

## What I'll do (build mode)

1. **Purge test user data** (in this order to satisfy FKs):
   - `wallet_transactions` where `user_id = <test>`
   - `payout_requests`, `point_requests` where `user_id = <test>`
   - `ufc_bets` where `user_id = <test>`
   - `predictions` where `user_id = <test>` (also removes rows from `market_odds_snapshots`/`match_pool_transactions` only if they cascade; otherwise deleted by prediction_id where present)
   - `match_pool_transactions` rows tied to those predictions/bets
   - `wallets` row for the test user
   - `profiles` row for the test user
   - `user_roles` rows for the test user
   - `auth.users` row is left alone (managed by Supabase); email can be nulled from `profiles` only. If you want the auth row deleted too, say so and I'll use the admin API in a one-off server fn.

2. **Restate `platform_bankroll` (kind = 'live')** from surviving rows:
   - `total_stakes_collected` = 36,396.71
   - `total_payouts_paid` = 32,838.81
   - `balance` adjusted by `−(test_user_net_contribution)` so the opening seed is preserved. I'll compute the exact delta from the deleted wallet_transactions bankroll debits/credits and apply it in the same transaction.

3. **Report back** a final ledger:
   - Stakes collected, payouts paid, realized PnL, open liability, restated bankroll balance.

### Technical notes

- All deletes and the bankroll restatement run in a single `supabase--insert` transaction so a failure rolls the whole thing back.
- No schema changes, no RLS changes, no code changes.
- Simulation rows (`is_simulation = true`) are left untouched for everyone — they never touched the live bankroll.
- If any FK blocks a delete I'll surface the row and ask before force-cascading.

Approve and I'll execute.
