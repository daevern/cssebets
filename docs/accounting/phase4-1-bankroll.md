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

## 7. Phase 4.1 closure controls

### 7.1 Liability formula (documented, intentionally conservative)

The exact economic bound is

```
max net liability = max(0, max gross payout − stake) <= available reserve before stake
```

equivalently `max gross payout <= reserve after stake collection`.

`arcade_place_plinko_drop` deliberately enforces the stricter

```
max gross payout <= available reserve before stake
```

which **understates available capacity by exactly the stake** (a 50-stake / 3x board is
rejected at a 100 reserve even though it is economically covered). Kept as a conservative
risk policy; the comment in the function records the exact bound so it can be relaxed
later without re-deriving it.

### 7.2 Concurrent exposure locking — verified

`accounting_available_reserve(env)` was a `STABLE` read with no locking, so two
simultaneous drops could both pass on the same reserve. Replaced in the drop path by
`accounting_available_reserve_locked(env)` (VOLATILE, service-role only), which:

1. takes `pg_advisory_xact_lock('accounting_reserve:<env>')`, and
2. takes `FOR UPDATE` on the `HOUSE_BANKROLL` / `PAYOUTS_PAYABLE` balance rows —
   the same rows `accounting_post_journal` updates,

both held until the drop transaction commits (accept **and** settle). The second
request therefore evaluates the reserve *after* the first has committed its stake and
payout journals, and is rejected if the remaining reserve is insufficient. No negative
reserve or overcommitted payout is reachable.

Verified with two genuinely concurrent backend sessions (both fired at the same second):

| Session | started | acquired | released | wait |
| --- | --- | --- | --- | --- |
| B | 13:24:00.241 | 13:24:00.304 | 13:24:05.306 | 0.06 s |
| A | 13:24:00.243 | 13:24:05.312 | 13:24:10.315 | **5.07 s** |

A blocked for the full hold of B and only then read the reserve — serialised, not
racing. The probe table and probe function were dropped after the test.

### 7.3 `PLINKO_PL_TO_RESERVE` excluded from P/L

It is an `EQUITY` closing/clearing account, never revenue or expense. New view
`v_accounting_platform_pl` (service-role only) computes

```
platform_pl = REVENUE − EXPENSE
```

and explicitly excludes `PLINKO_PL_TO_RESERVE`, exposing its balance only as
`excluded_transfer_clearing` for control purposes. Current state:

| Env | revenue | expense | platform P/L | Δ HOUSE_BANKROLL |
| --- | --- | --- | --- | --- |
| SIMULATION | 1.00 | 0.40 | 0.60 | +0.60 ✓ |
| PRODUCTION | 101.00 | 98.90 | 2.10 | +2.10 ✓ |

The invariant `REVENUE − EXPENSE = Δ HOUSE_BANKROLL` holds in both live environments,
and the transfer account cannot be double counted.
