# Phase 4.1 — Plinko house-bankroll integration and payout-capacity control

Closes the gaps raised against Phase 4: the journals were correct P&L but never moved
`HOUSE_BANKROLL`, the two legs shared a game-id-only key, no exposure control existed, and the
Plinko reversal path was broken.

## 1. Defined relationship between P/L, bankroll and reserve

New account per live environment: `PLINKO_PL_TO_RESERVE` (EQUITY, DEBIT normal) — the closing
account that transfers realised Plinko P/L into the house reserve on every round.

Stake journal (`STAKE_PLACED`), stake 100:

```
Dr USER_WALLET             100
Cr PLINKO_STAKE_REVENUE    100
Dr PLINKO_PL_TO_RESERVE    100
Cr HOUSE_BANKROLL          100
```

Payout journal (`PAYOUT_SETTLED`), payout 250:

```
Dr PLINKO_PAYOUT_EXPENSE   250
Cr USER_WALLET             250
Dr HOUSE_BANKROLL          250
Cr PLINKO_PL_TO_RESERVE    250
```

Invariants now enforced and reported:

- `Δ HOUSE_BANKROLL = PLINKO_STAKE_REVENUE − PLINKO_PAYOUT_EXPENSE` (losing stakes raise the
  bankroll, gross payouts lower it).
- `PLINKO_PL_TO_RESERVE = Plinko P/L` (the closing mirror; it is not a second P&L account).
- `available reserve = HOUSE_BANKROLL − PAYOUTS_PAYABLE`, via
  `accounting_available_reserve(environment)`.
- Platform P/L reporting reads **only** revenue − expense. Wallet movements are never used to
  derive Plinko P/L, so there is no double count.

A one-off `ADMIN_CORRECTION` journal (`plinko-bankroll-catchup:<env>:v1`, `J0000000010`)
transferred the realised P/L of the pre-4.1 Plinko journals into the reserve. No historical
journal, wallet or bankroll row was edited or deleted.

## 2. Idempotency keys

Distinct versioned keys per leg:

- `plinko:<game_id>:stake:v1`
- `plinko:<game_id>:payout:v1`
- reversals: `plinko-reversal:<game_id>:<leg>:v1`

Legacy `plinko-stake:<id>` / `plinko-payout:<id>` journals are still recognised, so a
pre-4.1 game can never be posted twice.

## 3. Payout-capacity control (pre-drop)

`arcade_place_plinko_drop` now refuses a drop before any money moves when

```
stake × max multiplier of the selected board > accounting_available_reserve(environment)
```

raising `EXPOSURE_LIMIT`. The UI surfaces it as "Stake too large right now…".

## 4. Correction path fix

`accounting_reverse_plinko_game` previously called `accounting_reverse_journal` without the
required idempotency key, so **every** correction attempt failed. It now supplies a versioned key
per leg, reverses in descending ledger order, and raises `ACCOUNTING_NOTHING_TO_REVERSE` when
there is nothing POSTED left.

## 5. Verification — `accounting_plinko_selftest()`

Service-role only; every scenario runs in a subtransaction that is rolled back, so it writes
nothing (verified: 0 residue rows, 4 games before and after).

| Scenario | Stake | Payout | Expected P/L | P/L | Bankroll Δ | Wallet Δ |
| --- | --- | --- | --- | --- | --- | --- |
| Full loss | 100 | 0 | +100 | +100 ✓ | +100 ✓ | −100 ✓ |
| Partial return | 100 | 60 | +40 | +40 ✓ | +40 ✓ | −40 ✓ |
| Push | 100 | 100 | 0 | 0 ✓ | 0 ✓ | 0 ✓ |
| Win | 100 | 250 | −150 | −150 ✓ | −150 ✓ | +150 ✓ |
| Void refund | 100 | 100 | 0 | 0 ✓ | 0 ✓ | 0 ✓ |

Each scenario additionally proves: distinct versioned keys, reversal restores the wallet **and**
bankroll to the exact pre-game balances, originals remain `REVERSED`/immutable, and a second
reversal is rejected (a re-settlement needs an explicit new settlement version).

Forced-failure atomicity: a drop that aborts after the stake journal leaves
`forced_failure_rollback_clean = true` — no journals, no game row, no wallet transaction, and no
bridge row marked `SYNCED`.

Post-change global state: `v_accounting_plinko_bankroll_control.reconciled = true`,
drift 0.00, pending/error 0, trial-balance imbalance 0.00,
`ready_for_product_migration = true`.

## 6. Reporting sources

- Product P/L: `PLINKO_STAKE_REVENUE − PLINKO_PAYOUT_EXPENSE`.
- Operational reserve: `accounting_available_reserve(env)` = `HOUSE_BANKROLL − PAYOUTS_PAYABLE`.
  `HOUSE_BANKROLL` may now be reported as the gaming reserve for Plinko because it incorporates
  realised Plinko P/L.
- Control view: `v_accounting_plinko_bankroll_control` (service-role only).

Other products remain on legacy logic with their flags disabled.
