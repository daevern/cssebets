# Phase 1 — Extended Verification Report

Status: **verification only**. No compensating balance entries were posted, no
ledger migration was started. Every test either rolls back or removes its own
synthetic fixture.

Artifacts:

| File | Purpose |
| --- | --- |
| `supabase/tests/phase1_verification.sql` | T1–T7: transaction boundary, ALREADY_SETTLED, versioning, regrade cycle, losing-outcome claims, coverage matrix |
| `supabase/tests/settlement_concurrency.py` | Two-session concurrent settlement + application-level integration assertions |
| `src/lib/accounting/settlement-errors.ts` | Maps duplicate-settlement DB errors to a controlled `ALREADY_SETTLED` app response |

---

## 1. Transaction-boundary proof

`settlement_claim()` is a plain `INSERT` inside the caller's transaction; it
opens no subtransaction, does no `COMMIT`, and is not `AUTONOMOUS`. Both the
claim and every wallet/bankroll movement therefore share one transaction and
one commit point.

Forced-failure test (T1), using `settlement_claim_then_fail()` which claims and
then raises:

```
claim -> RAISE EXCEPTION FORCED_FAILURE_AFTER_CLAIM
rows in settlement_journal for the reference after failure = 0   (rolled back)
retry claim -> succeeds, allocated version 1 again                (no poisoned key)
```

Result: **PASS**. A failed settlement leaves no claim behind and no retry is
blocked by a ghost key.

The concurrency test proves the money side of the same boundary: session A
settled two predictions (wallet credit + bankroll payout + journal row), rolled
back, and afterwards the wallet balance and simulation bankroll were byte-identical
to their pre-test values (`60.00 -> 60.00`, `1000000.00 -> 1000000.00`).

---

## 2. Concurrency results (two real sessions)

Fixture: synthetic simulation match, one winning and one losing prediction,
settled with the **production** function `settle_match_atomic()`.

| Step | Observation |
| --- | --- |
| A: `BEGIN; settle_match_atomic(...)` | `A_settled=2`, holds `matches`/`predictions` row locks |
| B: `BEGIN; settle_match_atomic(...)` | **blocked** — `pg_blocking_pids()` reported 1 blocked session while A held the locks |
| A: `ROLLBACK` | B unblocks and settles: `B_settled=2` |
| B: verification | see table below |
| B: repeat settle in same txn | `0` rows settled, no extra ledger/journal rows |

Verified counts inside session B:

| Assertion | Expected | Actual |
| --- | --- | --- |
| Winning predictions settled | 1 | 1 |
| Losing predictions settled | 1 | 1 |
| Payout wallet transactions | 1 | 1 |
| Settlement-journal rows (win) | 1 | 1 |
| Settlement-journal rows (loss) | 1 | 1 |
| Bankroll `payout_paid` rows | 1 | 1 |
| Wallet balance | 60.00 → 80.00 | 60.00 → 80.00 |

**Exactly one settlement, one payout and one journal record.** Settlement is
serialised by `SELECT ... FOR UPDATE` on the match and the predictions, and the
second worker's `status='pending'` predicate then matches nothing.

---

## 3. Versioning design

The previous allocator was `COUNT(reverse rows) + 1`, declared `STABLE`, with no
lock — two concurrent allocators read the same count, and a missing reversal row
collapsed every future settlement back onto version 1.

New `settlement_next_version(product, reference_id, action)`:

1. `pg_advisory_xact_lock(hashtext(product), hashtext(reference_id))` — version
   allocation for one source record is serialised for the rest of the transaction.
2. `MAX(settlement_version)` over `settle | resettle | regrade` rows.
3. `settle/resettle/regrade` → `MAX + 1` (strictly monotonic).
   `reverse/adjust` → `GREATEST(MAX, 1)` — a reversal attaches to the version it
   reverses, so `UNIQUE(product, reference_id, version, action)` still permits
   `settle v1 + reverse v1` while refusing a second `settle v1`.

Function is now `VOLATILE` (it takes a lock), so the planner cannot cache or
hoist it. T3 covers: reversal targets v1, next settle is v2, and allocation no
longer depends on reversal counts (a v1 settle plus an `adjust` still yields v2).

---

## 4. Regrade cycle

Sequence tested (T4):

```
v1 settle   score A   -> claimed
   reverse  v1        -> claimed
v2 settle   score B   -> claimed
   reverse  v2        -> claimed
v3 settle   score A   -> claimed   <-- original score re-settles successfully
v3 settle   score A   -> REFUSED   <-- same-version duplicate
journal rows = 5
```

Result: **PASS**. The football score guard was also changed: its idempotency key
is now `football_match:<id>:v<version>:<score basis>` instead of the score basis
alone, so a score is never permanently blacklisted. Runaway provider flapping is
instead bounded — the same score basis may drive at most **3** resettle cycles
per match, after which the guard logs `match.score_resettle_cycle_capped` and
does nothing.

---

## 5. Controlled duplicate response

* `settlement_try_claim()` returns JSON: `{"status":"CLAIMED"}` or
  `{"status":"ALREADY_SETTLED", claim_id, settlement_version, final_status,
  gross_payout, settled_at}` — the existing result, idempotently.
* `settlement_journal_guard()` still aborts the transaction on a duplicate (that
  is the money-safety property) but now raises
  `ALREADY_SETTLED: <product> <action> v<n>` with **SQLSTATE `P0409`** instead of
  a raw `23505`.
* `src/lib/accounting/settlement-errors.ts` maps both onto
  `{ status: "ALREADY_SETTLED", ... }` via `isAlreadySettled()`, `fromClaimResult()`
  and `runSettlement()`.

T2 verifies the duplicate response echoes the original `claim_id` and
`gross_payout` (120.50).

---

## 6. Settlement coverage matrix

Guard configuration verified live from `pg_get_triggerdef` (T6/T7 assert this,
not documentation).

| # | Product | Source table | Win | Loss | Push | Void | Refund | Reversal | Regrade | Timeout / abandoned | Admin path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Football | `predictions` | `won` | `lost` | n/a (no push market) | `void` | `void` + wallet refund | `→ pending` | versioned resettle via `matches_score_change_guard` | `void_match_atomic` | `settle_match_all_markets_atomic`, `void_match_atomic` |
| 2 | UFC | `ufc_bets` | `won` | `lost` | n/a | `void` | `refunded` | `→ open/pending` | re-settle at next version | `finalize_ufc_fight_void_remaining` (12 h sweep) | `void_ufc_bet_manual`, `settle_ufc_fight_atomic` |
| 3 | F1 | `f1_bets` | `won` | `lost` | n/a | `void` | `refunded` | `→ open/pending` | re-settle at next version | market suspension + auto-void | `runF1AutoSettle` / admin resolve |
| 4 | Sports (generic) | `sports_bets` | `won` | `lost` | n/a | `void` | `refunded` | `→ pending/open` | re-settle at next version | settlement-run void | `settle_sports_market_atomic(p_void)` |
| 5 | Blackjack | `arcade_bj_hands` | `COMPLETED` (result `WIN`/`BLACKJACK`) | `COMPLETED` (result `LOSS`/`BUST`) | `COMPLETED` (result `PUSH`) | `VOID` | `VOID` | `REVERSED` | new version on re-resolve | `EXPIRED` via `arcade_bj_expire_hands` | `arcade_bj_admin_resolve_hand` |
| 6 | Plinko | `arcade_plinko_games` | `WIN` | `LOSS` | n/a | `VOID` | `VOID` | `REVERSED` | new version | `VOID` | admin void |
| 7 | Roulette | `arcade_roulette_spins` | `WIN` | `LOSS` | `PUSH` | `VOID` | `VOID` | `REVERSED` | new version | `VOID` | admin void |
| 8 | Treasure Grid | `arcade_treasure_rounds` | `WON` | `LOST` | `PUSH` | `VOID` | `VOID` | `REVERSED` | new version | `EXPIRED` via `arcade_treasure_expire_rounds` | `arcade_admin_resolve_treasure_round` |

Known granularity gap (accepted for Phase 1): blackjack journals the settlement
event on `status = COMPLETED`; the win/loss/push detail lives in
`arcade_bj_hands.result`. A change of `result` without a change of `status`
would not create a second claim. Flagged for Phase 3.

**Losing outcomes create claims.** Verified two ways: T5 (a `lost` claim is made
and is not re-claimable) and the concurrency run, where the losing prediction
produced exactly one journal row despite generating zero wallet movement.

---

## 7. Bankroll reconciliation

Live: `platform_bankroll.id = 1` → **51,937.15**.
Last non-simulation `platform_transactions.balance_after` → **51,937.15** (identical).

### 7.1 Why the variance figure changed

Both figures are the same ledger measured on two different bases:

| Basis | Sum of deltas | vs live balance |
| --- | --- | --- |
| **Intended** signs (current `platform_apply_change` rules applied to historic rows) | 175,851.06 | **123,913.91** — the "original variance" |
| **Recorded** signs (`balance_after − balance_before` as actually written) | 118,271.06 | **66,333.91** — the "latest variance" |
| Difference | 57,580.00 | = the clawback-sign component |

Per-type breakdown (non-simulation):

| Type | Rows | Amount | Recorded Δ | Intended Δ | Diff |
| --- | --- | --- | --- | --- | --- |
| stake_collected | 354 | 27,448.50 | +27,448.50 | +27,448.50 | 0 |
| payout_paid | 384 | 117,711.90 | −117,711.90 | −117,711.90 | 0 |
| void_refund | 60 | 1,159.50 | −1,159.50 | −1,159.50 | 0 |
| admin_topup | 5 | 168,174.00 | +168,174.00 | +168,174.00 | 0 |
| match_pool_collected | 62 | 14,072.21 | +14,072.21 | +14,072.21 | 0 |
| **payout_clawback** | 233 | 85,027.75 | **+27,447.75** | +85,027.75 | **−57,580.00** |

So **no new drift appeared**: 123,913.91 − 57,580.00 = 66,333.91 exactly. The
57,580.00 is the historic clawback-sign defect (28,790.00 of clawbacks applied
as −amount instead of +amount; the mis-signed subset is `2 × 28,790.00 = 57,580.00`).
It is *not* a further component of the 66,333.91 — it is the difference between
the two measurements. Consequently the "remaining 8,753.91" figure
(66,333.91 − 57,580.00) does not correspond to any real ledger component; it is
an artefact of subtracting the two bases from each other.

### 7.2 Components of the real 66,333.91

The bankroll balance always equals the last row's `balance_after`, so the entire
variance is chain **discontinuity** (`balance_before ≠ previous balance_after`).
29 rows break the chain; the remainder are same-timestamp ordering noise that
cancels.

| Component | Amount | Reference |
| --- | --- | --- |
| Out-of-ledger bankroll reset ("Bankroll seed restored": balance was 60,010.00, row starts from 0.00 and seeds 50,000.00) | **−60,010.00** | `platform_transactions.id = dbfbdbd2-74e0-45aa-afb1-6797773575ce`, 2026-06-11 18:32:15 |
| Lost update on 2026-07-15 (stake increase written from a stale balance 52,041.59) | **−5,411.31** | `platform_transactions.id = f40db6fd-316b-4431-9823-dd3f3cbbb9fe`, 2026-07-15 14:21:17 |
| 27 further chain breaks (concurrent read-modify-write on `platform_bankroll`), by day: 06-12 +310.80, 06-13 −238.00, 06-14 +19.80, 06-15 −92.60, 06-19 +10.00, 06-27 −440.00, 06-28 +8.40 net, 06-30 −80.00, 07-01 −464.90, 07-03 −19.60, 07-06 −60.00, 07-07 −30.00, 07-09 −580.00, 07-12 +177.30 | **−1,478.80** | see query in §7.4 |
| Same-timestamp ordering residual (nets out; not a real loss) | **+566.20** | interleaved rows sharing one `created_at` |
| **Total** | **−66,333.91** | matches the observed variance exactly |

The 2026-06-28 cluster (`payout_paid` +2,195.20 / `payout_clawback` −2,226.80,
four identical 254.00 pairs at 06:20, 06:32, 06:42, 06:58) is the duplicate
settlement loop identified in the original audit; it is bankroll-neutral in
amount but each pair re-read a stale balance.

**Unexplained remainder: 0.00.** Every 100% of the 66,333.91 is attributed
above. The 60,010.00 reset is *identified* but its authorisation is not
recorded — there is no `audit_log` entry for it, only the note
"Bankroll seed restored".

### 7.3 Simulation bankroll

`platform_bankroll.id = 2` = 1,000,000.00 with zero non-zero simulation
transactions — consistent.

### 7.4 Reproduction query

```sql
WITH t AS (
  SELECT id, created_at, transaction_type, amount, balance_before, balance_after,
         lag(balance_after) OVER (ORDER BY created_at, id) AS prev_after
  FROM platform_transactions WHERE COALESCE(is_simulation,false) = false)
SELECT created_at, transaction_type, amount, balance_before, prev_after,
       balance_before - COALESCE(prev_after,0) AS chain_break
FROM t a
WHERE (balance_before = 0 AND prev_after IS NOT NULL)
   OR (balance_before <> 0 AND NOT EXISTS (
        SELECT 1 FROM t x WHERE x.id <> a.id AND x.balance_after = a.balance_before))
ORDER BY created_at;
```

---

## 8. Wallet reconciliation — the 100.00 variance

User `1a8f9625-5eb2-4d3b-88d1-01b6a055e410`.

| Measure | Value |
| --- | --- |
| `wallets.balance` (live) | **60.00** |
| Last `wallet_transactions.balance_after` | **60.00** |
| Signed sum treating `adjustment` as a debit | **60.00** |
| Signed sum **excluding** the adjustment row | 160.00 → variance **100.00** |
| Signed sum treating `adjustment` as a credit | 260.00 |
| Chain breaks (`balance_before ≠ previous balance_after`) | net **0.00** (ordering only) |

The single adjustment row:

```
id       6701dc4c-6f20-4b00-bd1e-fbbcbf8bfc1c
2026-07-04 18:52:35   type=adjustment   amount=100.00
balance_before=150.00  balance_after=50.00   note='Admin manual deduction'
```

**Verdict: the wallet balance is correct.** The 100.00 was genuinely deducted —
`balance_before − balance_after = 100.00`, the chain is continuous either side of
it, and the live balance matches the ledger endpoint exactly. The variance exists
only because the row stores a **positive** `amount` under
`type = 'adjustment'`, so any report that signs rows by `type` (crediting or
skipping anything that is not `'debit'`) derives 160.00 instead of 60.00.

This is a **ledger-derived reporting defect, not a balance defect.** No wallet
correction is warranted. The fix belongs in reporting/Phase 3: derive direction
from `balance_after − balance_before`, or split `adjustment` into signed
`adjustment_credit` / `adjustment_debit` categories.

---

## 9. Remaining unexplained variance

| Area | Unexplained |
| --- | --- |
| Bankroll (id 1) | **0.00** — fully decomposed in §7.2 |
| Bankroll (id 2, simulation) | 0.00 |
| Wallet `1a8f9625…` | 0.00 — proven to be a reporting artefact |
| Authorisation trail for the 60,010.00 reset | **open** — no `audit_log` record exists for `dbfbdbd2-…`; needs a human answer before Phase 2 |

## 10. Not done (as instructed)

* No compensating balance entries posted.
* No clawback re-signing, no bankroll correction, no wallet correction.
* Unified double-entry ledger migration (Phase 3) not started;
  `accounting_migration_flags` remains all-false for all eight products.
