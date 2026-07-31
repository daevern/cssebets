# Phase 8 — Global Monetary Rounding Policy

**Status:** complete · self-test `public.accounting_phase8_selftest()` → 14/14 passing.

## Policy

| Concept | Rule |
| --- | --- |
| Scale | Every monetary (points) value is stored and computed at **exactly 2 decimal places** |
| Mode | **Half-up / away-from-zero**, identical to Postgres `round(numeric, 2)` |
| Stakes | `acct_round_stake()` — half-up at collection time |
| Payouts | `acct_round_payout()` — half-up; sub-cent residual stays in house P/L (never silently truncated, see Phase 7) |
| Liability / exposure | `acct_round_liability()` — **always rounded up** so reservations never under-cover |
| Floats | Money is never held in `double precision`; all money columns are `numeric(_,2)` |

## Database surface

Helpers (all `IMMUTABLE`, schema `public`):

- `acct_money_scale()` → `2`
- `acct_round_money(numeric)`
- `acct_round_stake(numeric)`
- `acct_round_payout(numeric)`
- `acct_round_liability(numeric)` (ceiling to the cent)
- `acct_money_ok(numeric)` → boolean scale guard

## Schema tightening

The last unbounded `numeric` money columns were pinned to `numeric(18,2)`, so
Postgres enforces the policy on write (values are coerced, not rejected):

- `predictions.gross_payout`, `.house_profit_loss`, `.net_profit`
- `payout_requests.amount`
- `wallet_adjustment_requests.amount`, `.before_balance`, `.after_balance`
- `matches.worst_case_gross_payout`, `.worst_case_net_liability`
- `correlated_exposure_alerts.gross_payout`, `.net_liability`, `.total_stake`
- `match_exposure_scenarios.gross_payout`, `.net_liability`, `.total_stake_involved`

Views `match_market_exposure` and `v_accounting_migration_readiness` were dropped
and recreated unchanged around the type changes.

## Application mirror

`src/lib/accounting/money.ts` exposes `roundMoney`, `roundStake`, `roundPayout`,
`roundLiability`, `isMoneyScaleOk`, `potentialPayout` and `formatPoints` with the
same semantics (including an epsilon guard for binary-float artefacts such as
`1.005`). The database remains authoritative; the TS helpers exist so UI and
server-function arithmetic can never disagree with stored values.

## Self-test

`select * from public.accounting_phase8_selftest();`

Checks:

1. `round_half_up` — 1.005 → 1.01, −1.005 → −1.01
2. `liability_rounds_up` — 1.001 → 1.01
3–9. Stored-scale compliance for wallet transactions, wallets, journal lines,
   predictions, UFC bets, F1 bets, liability reservations
10. `wallet_txn_arithmetic` — `|balance_after − balance_before| = |amount|`
11. `journals_balanced` — debits equal credits to the cent
12–13. Potential payouts equal `round(stake × odds, 2)` for UFC and F1
14. `zero_unposted_residual` — no sub-cent residual sitting in journal lines

Last run: all checks passed, residual `0.00`.
