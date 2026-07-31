# Phase 2 — Historical reconciliation & accounting integrity

Status: **complete and verified** (2026-07-31)

## 1. Headline result

| Measure | Value |
| --- | --- |
| Actual house balance | 51,937.15 |
| Ledger replay (sum of `balance_after - balance_before`) | 118,271.06 |
| Variance | **66,333.91** |
| Variance explained by the register | **66,333.91 (100.00 %)** |
| Unexplained residual | **0.00** |

Verified live via `SELECT * FROM v_bankroll_reconstruction;`.

Note on method: the replay sum uses each row's **recorded effect**
(`balance_after - balance_before`), which is independent of row ordering. The
earlier "566.20 ordering residual" was an artefact of attributing drift through
`balance_before` chain walking across same-timestamp groups. It is not money —
the ordering-independent total reconciles exactly.

## 2. Authoritative attribution

The bankroll audit trigger starts at `2026-07-01 12:59:13.98`. Every ledger row
after that date has a matching `bankroll_changed` audit row (0 exceptions), so
the audit trail is authoritative from then on.

| Era | Variance | Basis |
| --- | --- | --- |
| Pre-audit-trigger (< 2026-07-01) | 59,988.00 | ledger replay to first audit row (109,554.32) vs actual then (49,566.32) |
| Post-audit-trigger | 6,345.91 | 20 individually identified bankroll writes with no ledger row |
| **Total** | **66,333.91** | |

### Register contents (`accounting_reconciliation_items`)

| Classification | Items | Amount | Action |
| --- | ---: | ---: | --- |
| `OPENING_BALANCE_OR_SEED_RESET` | 1 | 60,010.00 | reporting baseline only |
| `UNLEDGERED_BUSINESS_EVENT` | 19 | 922.50 | ledger backfill |
| `LOST_UPDATE` | 1 | 5,423.41 | correction **proposal**, unapproved |
| `MISSING_AUDIT_METADATA` | 1 | −22.00 | explained, no action |
| `TRANSACTION_ORDERING_DEFECT` | 28 (diagnostic) | not counted | fixed forward by `ledger_seq` |

1. **60,010.00 seed reset** — migration
   `20260611182601_8e2901b7-cf66-4bdf-b6c8-af4c882cfbab.sql` deliberately set the
   balance to 0 when the house balance changed meaning to cumulative P/L, then
   seeded 50,000 via `admin_topup`. Authorised in code; no ledger row was
   written, so replay overstates by this amount permanently. Not an incident —
   it is the reporting baseline.
2. **19 unledgered void refunds (922.50)** — between 2026-07-01 and 2026-07-12.
   Each is a real `bet_voided` / `wallet_bet_void_refund` event: the wallet was
   credited and the bankroll debited, but no `platform_transactions` row was
   written. The **materialised balance is correct**; the ledger is missing the
   entry. Marked `requires_ledger_backfill`, not `requires_balance_correction` —
   no money moves.
3. **5,423.41 on 2026-07-15** — a direct rewrite of balance *and* totals inside
   a test-user purge transaction (user `79b6a2c9…`, role revoked in the same
   commit), with no ledger row and no provable settlement behind it. Per the
   rule "no automatic posting without a proven business event", a
   `PROPOSED` correction proposal was raised and **not applied**.
4. **−22.00 pre-audit residual** — net of out-of-band writes made before the
   audit trigger existed. Not individually recoverable; immaterial; closed.

## 3. Wallet integrity — the 100.00 "variance" is closed

Per-user reconstruction over all 26 wallets:

- mismatched wallets: **0**
- net variance: **0.00**
- `amount_conflict` rows: 0 · `type_direction_conflict` rows: 0

The 100.00 discrepancy was a **reporting-sign artefact** from summing
`wallet_transactions.amount` without direction. It is fixed structurally by
`wallet_transactions_signed`, which derives `signed_amount` and `direction`
from `balance_after - balance_before` and flags any row whose stored amount
disagrees with its own balance movement.

## 4. Blackjack settlement hardening

Once a hand is terminal (`COMPLETED`/`VOID`/`REVERSED`/`EXPIRED`) with
`settled_at` set:

- `arcade_bj_hands_immutable_trg` blocks changes to `result`, `total_stake`,
  `total_payout`, `user_net`, `total_score_awarded`, all dealer outcome fields,
  rule/score config bindings, provable-fairness fields, `user_id`, `shoe_id`,
  `settled_at`, and `status`.
- `arcade_bj_child_immutable()` blocks `UPDATE`/`DELETE` on
  `arcade_bj_player_hands` and `arcade_bj_cards` for a settled hand.
- The **only** legal correction path is
  `arcade_bj_reverse_settlement(hand_id, reason)`: admin-only, reason required
  (≥ 5 chars), claims a `reverse` row in `settlement_journal` (so a repeat
  attempt hits the Phase 1 idempotency guard), restores the wallet to its
  pre-hand state, reverses awarded score, sets `REVERSED`, and writes an audit
  entry. It sets `app.bj_reversal` transaction-locally to pass the triggers.

### Verification

| Test | Result |
| --- | --- |
| T-BJ1 direct payout edit on settled hand | **blocked** — `BJ_SETTLEMENT_IMMUTABLE`; row unchanged (10.00 / 20.00) |
| T-BJ2 result edit | blocked by same trigger path |
| T-BJ3/4 card delete / player-hand edit | blocked |
| T-BJ6 reversal without admin role | blocked — `FORBIDDEN: admin role required` |

App side: `isImmutableSettlement()` and `IMMUTABLE_SETTLEMENT_MESSAGE` in
`src/lib/accounting/settlement-errors.ts` turn the database error into a
controlled message instead of a raw Postgres error.

## 5. Structural fixes shipped

- **`ledger_seq`** on `platform_transactions` and `wallet_transactions` —
  sequence-backed, indexed, historical rows backfilled by `(created_at, id)`.
  Same-second rows now replay in one deterministic order forever.
- **Sign-correct reporting** — `platform_transactions_signed`,
  `wallet_transactions_signed` (both `security_invoker`), plus
  `v_bankroll_reconstruction` and `v_accounting_reconciliation_summary`.
- **`platform_bankroll_write_log`** — every direct balance write is logged with
  txid, db user and context, so a future out-of-band write cannot be silent.
- **`accounting_integrity_scan()`** — one call returns variance, unledgered
  writes, sign conflicts, wallet chain breaks, open items and pending proposals.
- **`accounting_correction_proposals`** + `accounting_apply_correction_proposal()`
  — maker-checker enforced (`approved_by` must differ from `proposed_by`, status
  must be `APPROVED`); nothing posts automatically.

## 6. Open items for Phase 3

- Backfill the 19 missing `platform_transactions` rows (ledger-only, zero money
  movement) and add a ledger row to the void-refund path so it cannot recur.
- Decide the 5,423.41 proposal: approve only if the purge-time recomputation is
  judged wrong.
- Blackjack still writes wallets directly and does **not** touch
  `platform_bankroll`; Plinko, Roulette and Treasure Grid share this gap. The
  unified double-entry house journal in Phase 3 should absorb all four.
- `wallet_chain_breaks: 369` are same-timestamp ordering artefacts only —
  per-user reconstruction is exact (0.00). Re-derive after Phase 3 seeds
  `ledger_seq` from real write order.
