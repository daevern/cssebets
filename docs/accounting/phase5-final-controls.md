# Phase 5 — Final Production Controls

All checks run rollback-safe in the SIMULATION environment.
Result: **main 18/18, treasure 2/2**.

## 1. Cross-product reserve contention — PASS
All four products route capacity decisions through
`accounting_available_reserve_locked(env)`, which takes
`pg_advisory_xact_lock('accounting_reserve:<env>')` and `SELECT ... FOR UPDATE`
on the `HOUSE_BANKROLL` / `PAYOUTS_PAYABLE` balance rows.

- Plinko calls the locked reserve directly; Treasure, Roulette and Blackjack
  call it through `accounting_arcade_assert_capacity`.
- Source-level check confirms no product-specific bypass path.
- Every request recalculates the reserve *after* acquiring the lock, so a
  combined set of individually-affordable requests serialises and the ones that
  no longer fit are rejected with `EXPOSURE_LIMIT` **before** any wallet debit.

## 2. Blackjack maximum exposure — REWRITTEN
The old `least(max_payout, stake × 4)` heuristic is gone.

`arcade_bj_worst_case_gross(rule_config, stake)` derives the complete maximum
legal state tree:

```
hands            = max_split_hands
double_factor    = 2 if double_allowed AND (hands = 1 OR double_after_split) else 1
max_total_stake  = stake × hands × double_factor
worst_case_gross = max(max_total_stake × 2, stake × (1 + blackjack_payout))
```

(No insurance side bet exists in this implementation, so none is reserved.)

- `arcade_bj_start_hand` rejects the hand before any wallet movement if the
  worst case exceeds the table ceiling or the locked reserve.
- **Silent payout cap removed**: `arcade_bj_settle` no longer truncates
  `total_pay` to `max_payout`. It now asserts the sum of player-hand payouts
  equals `total_payout` (`PAYOUT_MISMATCH`) and fails loudly if the ceiling is
  ever breached (`PAYOUT_CEILING_BREACH`) — that condition can only mean the
  capacity check is unsound.
- The active rule config was realigned so `max_payout ≥ worst case at
  max_stake` (raised to cover 4 split hands doubled), and trigger
  `bj_rule_config_exposure_guard` blocks any future config that ships an
  unpayable ceiling. Capacity checking and settlement now use the same
  interpretation of the maximum payout.

## 3. Treasure Grid expiry — CORRECTED
Expiry now follows the published rules instead of always refunding:

- `safe_reveals = 0` → status `EXPIRED`, reason `ROUND_TIMEOUT`, stake refunded,
  wallet delta 0, bankroll unchanged.
- `safe_reveals ≥ 1` → status `EXPIRED`, reason `ROUND_TIMEOUT_AUTOCOLLECT`,
  auto-collected at the authoritative multiplier for the revealed count
  (`floor(stake × multiplier)`), journalled as a normal stake/payout pair.

Verified: 10-stake round with 1 safe reveal at ×1.2 → gross 12, wallet +2.
This closes the disconnect-to-avoid-a-loss path.

## 4. Roulette single-shot atomicity — PASS
Forced failure after the stake journal / before payout / before the spin is
marked complete leaves:

- no spin row, no journal, no wallet movement, no legacy rows marked `SYNCED`;
- the same idempotency key retries successfully exactly once.

## Scope
Sports products remain disabled pending their own product-by-product
reconciliation and migration review.
