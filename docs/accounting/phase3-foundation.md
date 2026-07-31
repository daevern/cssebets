# Phase 3 — Unified Accounting Foundation (shadow mode)

Status: **complete and verified**. No product posts to the new ledger yet; every
`accounting_migration_flags` product flag remains disabled (`journal_enabled = false`,
`dual_write = false`). No user wallet or bankroll balance was modified.

## 1. Schema

| Object | Purpose |
| --- | --- |
| `accounting_accounts` | Chart of accounts. One `ACTIVE` `USER_WALLET` per user (partial unique index), one `ACTIVE` `HOUSE_BANKROLL` per environment. Types: LIABILITY / ASSET / EQUITY / REVENUE / EXPENSE / HOUSE_RESERVE / SUSPENSE, each with an explicit `normal_balance`. |
| `accounting_journals` | Journal headers. Unique `idempotency_key`, unique `ledger_seq` (from `accounting_ledger_seq`, not timestamp-derived), unique `journal_number` (`J##########`), status DRAFT → POSTED → REVERSED, reversal linkage in both directions (a journal can be reversed at most once). |
| `accounting_journal_lines` | Debit/credit lines. Exactly one side per line (`acct_line_one_side`), non-negative amounts, `signed_effect`, `balance_before`, `balance_after` captured per line. |
| `accounting_account_balances` | Materialised balance, `last_ledger_seq`, optimistic `version`. Seeded automatically on account creation. |
| `accounting_cutover_batches` | Immutable-after-approval snapshot of the platform position at cutover, with `snapshot_hash`. |

Seeded non-user accounts: `HOUSE_BANKROLL` (production + simulation),
`LEGACY_OPENING_SOURCE`, `BONUS_EXPENSE`, `POINTS_ISSUANCE`, `POINTS_EXPIRY`,
`ROUNDING_ADJUSTMENT`, `ADMIN_ADJUSTMENT`, `MIGRATION_ADJUSTMENT`,
`MATCH_STAKE_POOL_LEGACY`. 120 `USER_WALLET` accounts created (one per wallet holder);
130 active accounts in total.

## 2. Canonical posting function

`accounting_post_journal(journal_type, lines, idempotency_key, …)` is the **only** write path.

Guarantees:

- Service-role/internal callers only (`accounting_caller_authorised()`); `EXECUTE` revoked from `anon`/`authenticated`.
- Idempotent: replaying an `idempotency_key` returns the original journal, posts nothing.
- Rejects: fewer than two lines, both-sided lines, zero lines, negative amounts, amounts with more than 2 decimals, and any journal where total debits ≠ total credits.
- Locks affected balance rows in deterministic `account_id` order before writing (no lost updates, no deadlock ordering hazard).
- Writes lines with `balance_before`/`balance_after`, updates the materialised balance and bumps `version`.
- Blocks a `USER_WALLET` from going negative unless explicitly overridden (reversals only).
- All-or-nothing: header, lines and balances commit in a single transaction.

`accounting_reverse_journal(journal_id, reason, idempotency_key, …)` posts a mirrored
`REVERSAL` journal, links both directions, and flips the original to `REVERSED`.
Reversal is the only correction mechanism — nothing is ever edited or deleted.

Immutability is enforced by triggers, not convention: posted journals, their lines and all
account balances raise `ACCOUNTING_IMMUTABLE` on any direct `UPDATE`/`DELETE`/`INSERT`
outside the posting functions. Approved cutover batches are frozen except for the single
`APPROVED → OPENING_POSTED` transition.

## 3. Cutover snapshot and opening journal

Batch `7fbcc9a1-ba41-47b7-b3bb-979d29386145`, status `OPENING_POSTED`,
snapshot hash `3eff0bc38ca988c613ca5747015d367c`.

| Item | Value |
| --- | --- |
| Live house bankroll | 51,937.15 |
| Simulation bankroll | 1,000,000.00 |
| Total user wallets (120 accounts, 14 funded) | 1,770.09 |
| Open sports stakes / gross payout exposure | 0.00 |
| Open arcade stakes | 0.00 |
| Pending payout requests (reserved liability) | 1,402.95 |
| Legacy ledger last sequence (`platform_transactions.ledger_seq`) | 1,117 |
| Pending Phase 2 correction (proposal `b0afb327…`) | 5,423.41 — **recorded, deliberately NOT posted** |

Opening journal `J0000000001` (`OPENING_BALANCE`, ledger_seq 1):
debits `LEGACY_OPENING_SOURCE` **1,053,707.24**, credits house production 51,937.15,
house simulation 1,000,000.00, and each funded wallet its exact balance.
Total debits = total credits = 1,053,707.24.

The 5,423.41 Phase 2 residual stays in `PROPOSED` state (Path B) and will be posted, if
approved, as a separate `MIGRATION_CORRECTION` journal — never folded into opening balances.

## 4. Read-only views

`v_accounting_journals`, `v_accounting_account_activity`,
`v_accounting_balance_reconstruction`, `v_accounting_trial_balance`,
`v_accounting_cutover_status` — service-role only.
`v_my_accounting_activity` (security invoker, `auth.uid()`-scoped) — authenticated users.

Current trial balance (post-opening):

```
HOUSE_BANKROLL production      51,937.15
HOUSE_BANKROLL simulation   1,000,000.00
USER_WALLET (all)               1,770.09
LEGACY_OPENING_SOURCE (Dr)  1,053,707.24
all other accounts                  0.00
```

`v_accounting_balance_reconstruction` variance: **0.00** across all 130 accounts.

## 5. Permissions

- No client role can insert, update or delete in any accounting table (no such policies exist).
- `authenticated` may read only its own account, balance and journal lines via RLS.
- Posting/reversal functions are `SECURITY DEFINER`, `search_path = public`, executable by
  `service_role` only.

## 6. Integrity tests (all passed, executed in a rolled-back transaction)

| # | Test | Result |
| --- | --- | --- |
| T1 | Unbalanced journal rejected | `ACCOUNTING_UNBALANCED` |
| T2 | Single-line journal rejected | rejected |
| T3 | >2-decimal amount rejected | rejected |
| T4 | Wallet cannot go negative | `ACCOUNTING_INSUFFICIENT_FUNDS` |
| T5 | Balanced journal posts, balances update | posted |
| T6 | Replay of same idempotency key | returns original, no new journal |
| T7 | `UPDATE` on posted journal | `ACCOUNTING_IMMUTABLE` |
| T8 | `DELETE` of posted journal lines | `ACCOUNTING_IMMUTABLE` |
| T9 | Direct balance tamper | `ACCOUNTING_IMMUTABLE` |
| T10 | Reversal restores the exact prior balance | balance restored |
| T11 | Double reversal | `ACCOUNTING_ALREADY_REVERSED` |

The test transaction was rolled back, so the live ledger contains exactly one journal:
`J0000000001` (opening balance).

## 7. Not in scope of Phase 3

Plinko, Roulette, Treasure Grid, Blackjack, football, UFC, F1 and generic sports remain on
the legacy wallet/bankroll path. Product wiring, dual-write and reconciliation-driven
cutover per product are Phase 4+.
