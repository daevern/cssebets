# Phase 3.1 — Foundation Hardening and Wallet Synchronisation

Status: **complete and verified**. Still shadow mode: every `accounting_migration_flags`
product flag remains `journal_enabled = false`, `dual_write = false`. No user wallet, no
bankroll and no historical monetary record was edited or deleted in this phase.

## 1. Ledger-sequence semantics

`accounting_ledger_seq` is a plain Postgres sequence. Rolled-back or failed postings consume
values, so **gaps are expected and are not evidence of tampering**. This is now documented on
the column itself:

```
COMMENT ON COLUMN accounting_journals.ledger_seq IS
  'Unique, immutable, monotonically increasing ordering key ... Gaps are EXPECTED ...'
```

Guarantees relied on downstream: uniqueness, immutability and monotonic ordering — not density.
Phase 3's integrity tests consumed 2–4, so live journals run 1, 5, 6, 7.

## 2. Environment separation

`acct_environment` enum (`PRODUCTION` / `SIMULATION` / `TEST`) replaces the free-text
environment label and now exists on:

| Object | Column |
| --- | --- |
| `accounting_accounts` | `environment` (was lowercase text + CHECK) |
| `accounting_journals` | `environment` (new, NOT NULL) |
| `accounting_cutover_batches` | `environment` (new, NOT NULL) plus `superseded_at` / `superseded_by` / `supersede_reason` |

`accounting_post_journal()` now **rejects any journal whose lines touch more than one
environment** (`ACCOUNTING_CROSS_ENVIRONMENT`). The single permitted exception is the reversal
of a pre-hardening journal that was itself mixed; such a reversal is tagged
`metadata.mixed_environment_reversal = true`.

Three player wallets belonging to simulation accounts were reclassified to `SIMULATION`
(label only, no monetary change). Per-environment accounts were created:
`LEGACY_OPENING_SOURCE_{PRODUCTION,SIMULATION,TEST}`, `LEGACY_PRODUCT_CLEARING` and
`PAYOUTS_PAYABLE` in all three environments.

## 3. Opening ledger rebuilt per environment (freshness)

The mixed Phase 3 opening journal `J0000000001` was **reversed**, never edited:

| Journal | Type | Env | Meaning |
| --- | --- | --- | --- |
| `J0000000001` | OPENING_BALANCE | (mixed) | Phase 3 opening — now `REVERSED` |
| `J0000000005` | REVERSAL | — | reverses the above, mixed-environment exception |
| `J0000000006` | OPENING_BALANCE | PRODUCTION | 54,640.19 |
| `J0000000007` | OPENING_BALANCE | SIMULATION | 1,000,470.00 |

Cutover batch `7fbcc9a1-…` is flagged `superseded_at`/`superseded_by` (frozen otherwise) and
replaced by two fresh batches snapshotted at re-post time:

**PRODUCTION** (`cab66c3f-…`) — Dr `LEGACY_OPENING_SOURCE_PRODUCTION` 54,640.19

| Credit | Amount |
| --- | --- |
| `HOUSE_BANKROLL` (production) | 51,937.15 |
| `USER_WALLET` × 117 real wallets | 1,300.09 |
| `PAYOUTS_PAYABLE` | 1,402.95 |

**SIMULATION** (`7d42cfef-…`) — Dr `LEGACY_OPENING_SOURCE_SIMULATION` 1,000,470.00

| Credit | Amount |
| --- | --- |
| `HOUSE_BANKROLL` (simulation) | 1,000,000.00 |
| `USER_WALLET` × 3 simulation wallets | 470.00 |

The old `LEGACY_OPENING_SOURCE` account is `CLOSED` at 0.00. Trial-balance imbalance: **0.00**
in both environments.

## 4. Reserved payout liability — fully classified

The 1,402.95 previously carried as an unexplained "reserved liability" is 6 cash-out requests
in `proof_uploaded`. Each user wallet was **already debited** at request time, with no
counterparty in the ledger. They are now recognised as `PAYOUTS_PAYABLE` (PRODUCTION) in the
opening journal and individually recorded in `accounting_reconciliation_items`
(scope `reserved_payout_liability`, classification `UNLEDGERED_BUSINESS_EVENT`,
resolution `RESOLVED`).

| Payout request | Amount |
| --- | --- |
| c986f36f… | 137.60 |
| afd70044… | 300.00 |
| 8579ac17… | 300.00 |
| 378f1c1b… | 312.00 |
| fc82900e… | 200.00 |
| d0c9f3a8… | 153.35 |
| **Total** | **1,402.95** |

Unclassified reserved liability: **0.00**.

## 5. Shadow wallet bridge

`wallet_transactions` gained `accounting_journal_id`, `accounting_sync_status`
(`PENDING`/`SYNCED`/`SKIPPED`/`ERROR`), `accounting_sync_error`, `accounting_synced_at`.
All 1,674 pre-cutover rows are `SKIPPED` (already inside the opening journals).

`accounting_bridge_wallet_transaction(tx_id)` mirrors one post-cutover wallet movement into the
ledger:

- environment derived from `wallet_transactions.is_simulation`;
- direction derived from `balance_after - balance_before` (zero delta ⇒ `SKIPPED`);
- counterparty is `LEGACY_PRODUCT_CLEARING` in the same environment, because no product posts
  to the journal yet;
- idempotency key `legacy-wallet-tx:<uuid>` ⇒ replay is a no-op;
- failures are captured on the row as `ERROR` + message and retried, never swallowed.

`accounting_bridge_sync(limit)` walks outstanding rows in deterministic
`ledger_seq, created_at, id` order. Cron job `accounting-wallet-bridge` runs it every 2 minutes.
Both functions are service-role only.

## 6. Reporting and go/no-go

| View | Purpose |
| --- | --- |
| `v_accounting_wallet_drift` | per user: legacy wallet balance vs ledger balance vs drift |
| `v_accounting_bridge_status` | bridge queue health by status |
| `v_accounting_migration_readiness` | single-row go/no-go |

All views are `security_invoker` and granted to `service_role` only.

Current readiness:

```
drift_users                      0
drift_total                      0.00
pending_tx / error_tx            0 / 0
trial_balance_imbalance          0.00
mixed_journals (excl. history)   0
reserved_payout_liability        1,402.95  (fully classified)
unclassified_reserved_liability  0.00
ready_for_product_migration      true
```

## 7. Not in scope

No product was wired into the journal. Plinko migration (Phase 4) may begin only while
`ready_for_product_migration` is `true`.
