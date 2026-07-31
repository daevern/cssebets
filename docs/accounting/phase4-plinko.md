# Phase 4 — Plinko migration onto the unified journal

Status: **complete and verified**. Plinko is the first product to post real double-entry
journals. Every other product flag remains `journal_enabled = false`, `dual_write = false`.
No historical wallet, bankroll or journal record was edited or deleted.

Precondition at start: `v_accounting_migration_readiness.ready_for_product_migration = true`
(drift 0, pending/error 0, trial-balance imbalance 0.00).

## 1. Chart of accounts additions

| Account | Type | Normal | Environments |
| --- | --- | --- | --- |
| `PLINKO_STAKE_REVENUE` | REVENUE | CREDIT | PRODUCTION, SIMULATION |
| `PLINKO_PAYOUT_EXPENSE` | EXPENSE | DEBIT | PRODUCTION, SIMULATION |

Plinko never touched `platform_bankroll` in the legacy model, so it is modelled as P&L rather
than a bankroll transfer. House margin per period = `PLINKO_STAKE_REVENUE − PLINKO_PAYOUT_EXPENSE`.

## 2. Posting model

`accounting_post_plinko_game(game_id)` (service-role only) posts up to two journals:

| Journal | Type | Lines |
| --- | --- | --- |
| `plinko-stake:<game_id>` | `STAKE_PLACED` | Dr `USER_WALLET` stake · Cr `PLINKO_STAKE_REVENUE` |
| `plinko-payout:<game_id>` | `PAYOUT_SETTLED` | Dr `PLINKO_PAYOUT_EXPENSE` payout · Cr `USER_WALLET` |

- Environment is derived from the player's `USER_WALLET` account, so simulation play can never
  contaminate production totals (`accounting_post_journal` also rejects mixed environments).
- Idempotency keys are derived from the game id, so replay is a no-op (verified).
- The two legacy `wallet_transactions` rows for the round are marked `SYNCED` and linked to the
  journals, so the shadow bridge (`LEGACY_PRODUCT_CLEARING`) can never double-post them.
- `settlement_version = 1`; corrections go through reversal, never mutation.

## 3. Product wiring

`arcade_place_plinko_drop` now calls the posting function **inside the same transaction** as the
wallet debit/credit, gated on `accounting_migration_flags`:

- `journal_enabled = true` → a posting failure aborts the whole drop (wallet and ledger can
  never diverge).
- `dual_write` only → failures are captured on the wallet rows as `ERROR` + message and retried
  by the bridge tooling; never swallowed silently.

Batch drops (`placePlinkoDropBatch`) reuse the same RPC per ball, so they are covered.

## 4. Corrections

`accounting_reverse_plinko_game(game_id, reason)` reverses every posted journal for one round in
descending ledger order via `accounting_reverse_journal`. It is the only correction path; posted
journals and lines remain immutable.

## 5. Reporting

`v_accounting_plinko_reconciliation` (security invoker, service-role only) compares
`arcade_plinko_games` against journal totals:

`journalled_games, legacy_stakes, ledger_stakes, stake_variance, legacy_payouts, ledger_payouts,
payout_variance, ledger_house_margin, unposted_games_since_cutover, reconciled`

## 6. Verification

End-to-end drop on a SIMULATION wallet (game `bb3a854f-…`, stake 1.00, multiplier 0.40x,
payout 0.40):

| Check | Result |
| --- | --- |
| Journals posted | `J0000000008` STAKE_PLACED, `J0000000009` PAYOUT_SETTLED, both `POSTED`, SIMULATION |
| Wallet rows | both `SYNCED`, linked to their journals (bridge cannot re-post) |
| Replay of the posting function | `idempotent: true`, no new journals |
| Plinko reconciliation | stake variance 0.00, payout variance 0.00, unposted 0, `reconciled = true` |
| Global readiness | drift 0 / 0.00, pending 0, errors 0, trial-balance imbalance 0.00 |

## 7. Not in scope

Treasure Grid, Roulette, Blackjack, generic sports, UFC, F1 and Football remain on legacy logic
with their flags disabled. They are migrated in the Phase 5 order already recorded in
`accounting_migration_flags.notes`.
