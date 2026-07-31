# Phase 6 — Authoritative Liability Reservation

## Goal
Every open position (arcade round or sports bet) holds a reservation equal to its
worst-case **net** liability, so the house bankroll can never be committed twice.

## Model
- Register: `accounting_liability_reservations` (unique on `reference_type, reference_id`).
- Net liability: `greatest(max_gross_payout - stake_collected, 0)`.
- `accounting_available_reserve(env) = house bankroll - payouts payable - SUM(reserved_amount WHERE status='ACTIVE' AND counts_toward_available)`.
- `counts_toward_available` follows `accounting_migration_flags.liability_enforced`
  per product, so sports products can run in shadow mode before enforcement.

## Lifecycle
| Product | Reserved at | Released at |
| --- | --- | --- |
| Plinko | placement (recorded already settled, reserve 0) | same transaction |
| Mini Roulette | placement (recorded already settled, reserve 0) | same transaction |
| Treasure Grid | `arcade_treasure_start_round` | terminal status (WON/LOST/PUSH/VOID/EXPIRED/REVERSED) |
| Blackjack | `arcade_bj_start_hand`, using `arcade_bj_worst_case_gross` (all splits + doubles + natural) | terminal hand status |
| Football / UFC / F1 / sports | placement trigger (shadow) | settlement trigger |

Blackjack reserves the worst case up front, so later `HIT`, `DOUBLE`, and
`SPLIT` actions never need an extra reservation.

## Capacity check
`accounting_arcade_assert_capacity(product, user, max_gross, stake)` rejects a
placement with `EXPOSURE_LIMIT` when its net liability exceeds the available
reserve at that moment. Zero-net-liability placements are always allowed.

## Verification — `accounting_phase6_selftest()`
Last run: **13/13 passed**.

- available reserve equals bankroll minus reserved
- Treasure Grid holds an active reservation and reduces availability
- Treasure Grid reservation releases on terminal status
- Blackjack reserves the exact worst-case gross and net
- Blackjack reservation releases on completion
- single-shot Plinko records a released reservation with zero hold
- capacity check rejects oversized net liability and allows zero-liability bets
- register invariants: active rows hold exactly their net liability, non-active
  rows hold zero, no active reservation survives a settled position

## Fix shipped during verification
`accounting_reserve_liability(..., p_settled => true)` previously inserted the
row as `RELEASED` while still storing the full net amount in `reserved_amount`,
permanently inflating reserved liability for every single-shot game. Settled
rows now store `0`, and existing rows were backfilled
(`release_reason = 'BACKFILL_ZERO_ON_RELEASED'`).
