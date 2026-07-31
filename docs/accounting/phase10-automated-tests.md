# Phase 10 — Automated Accounting Test Suite

Run it any time with:

```sql
SELECT public.accounting_phase10_selftest();
```

Latest run: **40 / 40 passed** (2026-07-31, `SIMULATION` environment).

## Entry points

| Function | Purpose |
| --- | --- |
| `accounting_phase10_selftest()` | Coordinator. Runs both suites, returns `{total, passed, failed, results[]}`. |
| `accounting_phase10_invariants()` | Read-only ledger invariants over live data. |
| `accounting_phase10_product_tests()` | Per-product lifecycles executed in `SIMULATION` and rolled back. |

All three are `SECURITY DEFINER` with `EXECUTE` revoked from `PUBLIC`/`anon`.

## Product lifecycle coverage

Every product test runs against the highest-balance simulation wallet, then
raises `ROLLBACK_TEST` so no mutation survives the call.

- **Plinko** — wallet delta = payout − stake, placement + settlement journals
  posted and balanced, payout rounded to exact cents, no active liability hold
  after settlement, idempotent replay of the same key does not double-charge.
- **Mini Roulette** — wallet delta = return − stake, `house_net` = stake −
  return, journals balanced, single-shot placement leaves no active hold.
- **Treasure Grid** — reservation is `ACTIVE` and equal to worst-case gross
  minus stake while the round is open, stake debited at acceptance, reservation
  `RELEASED` at zero on any terminal status, exactly one settlement journal.
- **Blackjack** — worst-case gross reserved at acceptance (matches
  `arcade_bj_worst_case_gross`), reservation released on completion, hand payout
  equals the sum of player-hand payouts, wallet delta = payout − stake.
- **Football** — win and loss settle in one pass, winner credited exactly once,
  loser produces no wallet row, duplicate settlement is a no-op, one settlement
  journal row per position; void refunds the pooled stake once and a repeat void
  changes nothing.
- **Capacity** — an oversized liability is rejected with `EXPOSURE_LIMIT`, while
  a zero-net-liability request is accepted.

## Ledger invariants

1. Every posted journal balances (debits = credits).
2. Each line's `balance_after − balance_before` equals its `signed_effect`.
3. Cached account balances match the latest posted line on that account.
4. `PAYOUT_SETTLED` journals credit the player's wallet by exactly the payout
   expense.
5. Per product/environment: P/L-to-reserve = stake revenue − payout expense.
6. Platform P/L is reported as product P/L plus disclosed adjustments.
7. No duplicate settlement journals for the same position and version.
8. No orphan journals pointing at deleted arcade rows.
9. Every journal-era Plinko game has a settlement journal.
10. Liability register: active holds equal max net liability, non-active hold
    zero, and no active hold survives a settled Treasure round or Blackjack hand.
11. Wallet ledger chain has no breaks since the journal era, and every wallet
    balance equals its latest `balance_after`.

### Known historic residue

The wallet chain check reports `historic_breaks: 369`. These all predate the
unified journal (legacy manual adjustments written before `balance_before` /
`balance_after` were enforced) and are deliberately excluded from the pass
condition; `new_breaks` must stay at 0.
