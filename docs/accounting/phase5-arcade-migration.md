# Phase 5 — Arcade products on the unified house journal

Scope: Treasure Grid, Mini Roulette, Blackjack. Sports (football / UFC / F1) remain
un-journalled and their flags stay disabled.

## Chart of accounts (PRODUCTION + SIMULATION)

| Account | Type | Purpose |
| --- | --- | --- |
| `<P>_STAKE_REVENUE` | REVENUE | house income from stakes |
| `<P>_PAYOUT_EXPENSE` | EXPENSE | cost of payouts |
| `<P>_PL_TO_RESERVE` | EQUITY | clearing/transfer account, **excluded from platform P/L** |

`<P>` ∈ `TREASURE`, `ROULETTE`, `BLACKJACK` (same shape as `PLINKO`).

## Posting model

`accounting_post_arcade_settlement(product, ref_type, ref_id, user, stake, payout, …)`

- Stake leg (`STAKE_PLACED`): wallet Dr, `_STAKE_REVENUE` Cr, `_PL_TO_RESERVE` Dr, `HOUSE_BANKROLL` Cr.
- Payout leg (`PAYOUT_SETTLED`): `_PAYOUT_EXPENSE` Dr, wallet Cr, `HOUSE_BANKROLL` Dr, `_PL_TO_RESERVE` Cr.
- Idempotency keys: `<product>:<ref_id>:stake:v1` and `<product>:<ref_id>:payout:v1`.
- Net effect on `HOUSE_BANKROLL` = stake − payout (loss ⇒ +, win ⇒ −, push/void ⇒ 0).
- Matching `wallet_transactions` rows are marked `SYNCED` with the journal id.

`accounting_arcade_hook(...)` applies the migration flags: strict (transaction aborts)
when `journal_enabled`, best-effort with `accounting_sync_status = 'ERROR'` when only
`dual_write`.

## Wiring points

| Product | Stake leg | Payout leg |
| --- | --- | --- |
| Treasure Grid | `arcade_treasure_start_round` | `arcade_treasure_collect` (collect) / `arcade_treasure_expire_rounds` (refund = stake, net 0). Trap loss posts no payout, so the house keeps the stake. |
| Mini Roulette | `arcade_place_roulette_spin` | same call (single-shot settlement) |
| Blackjack | consolidated at `arcade_bj_settle` | same call — `total_stake` is recomputed from player hands so doubles/splits are included |

`arcade_bj_reverse_settlement` now also calls
`accounting_reverse_arcade_settlement('blackjack', hand, reason)`; original journals stay
immutable and reversal journals use `blackjack-reversal:<hand>:<leg>:v1` keys.

## Payout-capacity control

`accounting_arcade_assert_capacity(product, user, max_gross)` reads the reserve through
`accounting_available_reserve_locked(env)` (advisory lock + `SELECT FOR UPDATE` on the
`HOUSE_BANKROLL` balance row), so simultaneous rounds are evaluated sequentially.

Worst-case gross used per product:
- Treasure: `floor(stake × max multiplier of the config)`
- Roulette: max over all 13 pockets of the total gross return of the submitted bets
- Blackjack: `least(rule_config.max_payout, stake × 4)` (covers split + double)

Policy is deliberately conservative — gross payout is compared against the reserve
**before** the stake is collected, understating capacity by the stake amount.

## Reporting

- `v_accounting_platform_pl` — `REVENUE − EXPENSE`, excluding every `%_PL_TO_RESERVE`
  clearing account (reported separately as `excluded_transfer_clearing`).
- `v_accounting_treasure_reconciliation`, `v_accounting_roulette_reconciliation`,
  `v_accounting_blackjack_reconciliation` — legacy product tables vs journal amounts.

## Verification (`accounting_arcade_selftest`, SIMULATION, self-rolling-back)

36 assertions, `all_ok = true`, for each of the three products:

| Case | Expected bankroll Δ | Result |
| --- | --- | --- |
| loss (10 / 0) | +10.00 | pass |
| win (10 / 25) | −15.00 | pass |
| push (10 / 10) | 0.00 | pass |
| void/refund (10 / 10) | 0.00 | pass |
| replay of each case | 0.00 | pass (idempotent) |
| reversal of each case | exact inverse | pass |

Flags after Phase 5: `treasure`, `roulette`, `blackjack`, `plinko` →
`journal_enabled = true`. Sports products remain off.
