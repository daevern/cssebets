# Phase 10.1 — Bankroll Authority & Reservation Integrity Hardening

Status: **complete**. `SELECT public.accounting_phase101_selftest();` → **8/8 pass**,
`SELECT public.accounting_phase10_invariants();` → **13/13 pass**.

No balance, posted journal or reservation row was edited directly. The single
repair went through the product's own audited settlement path.

---

## 1. The stale Blackjack reservation — root cause

Reservation `5233283b-c404-4533-89dd-3c70a60acde1`
(hand `200022a7-3bd1-4e9b-86a5-8ce42a92a6f4`, user `6b1eafa4…`).

| Fact | Value |
| --- | --- |
| Hand started | 2026-07-31 09:44:23Z |
| Hand `expires_at` | 2026-07-31 09:45:23Z (1 min) |
| Hand status when found | `PLAYER_TURN` (never terminal) |
| Reservation created | 2026-07-31 **14:11:33Z** — `metadata.source = phase6_backfill` |
| `reserved_amount` | `0.00` (free-play hand, stake 0.00) |

Two independent defects combined:

1. **`arcade_bj_expire_hands()` was never scheduled.** The timeout sweep existed
   from Phase 5 but had no `cron.job`, so a player who closed the tab left the
   hand in `PLAYER_TURN` forever. The release trigger fires on terminal status,
   so it never fired.
2. **The Phase 6 backfill reserved against a still-open position.** At
   14:11:33 — the exact `updated_at` of the `liability_enforced` flip in
   `accounting_migration_flags` — the backfill created reservations for every
   non-terminal position, including this abandoned hand, hours after play ended.

It was therefore **not** a settlement-path bug and not a money defect: the hold
was `0.00`, so `accounting_available_reserve` was never understated.

### Remedy applied

`SELECT public.arcade_bj_expire_hands();` → 1 hand. The hand settled normally
(`COMPLETED`, result `LOSS`, dealer 21, payout 0.00) and the terminal-status
trigger released the reservation in the same transaction:
`RELEASED`, `reserved_amount = 0.00`,
`release_reason = TERMINAL_COMPLETED`, `initial_reserved_amount` preserved.
Available reserve unchanged at **50,590.30**. Active reservations: **0**.

---

## 2. Terminal positions can no longer retain active liability

### `accounting_position_state(reference_type, reference_id)`

One canonical reader mapping any arcade position to
`(product, status, outcome, is_terminal, settled_at)` across all four products:

| Product | Terminal statuses | Outcome mapping |
| --- | --- | --- |
| Plinko | WIN, LOSS, VOID, REVERSED | direct |
| Mini Roulette | WIN, LOSS, PUSH, VOID, REVERSED | direct |
| Treasure Grid | WON, LOST, PUSH, VOID, REVERSED, EXPIRED | WON→WIN, LOST→LOSS, EXPIRED→**CANCELLED** |
| Blackjack | COMPLETED, VOID, REVERSED, EXPIRED | result-driven; MIXED resolved by payout vs stake; EXPIRED→**CANCELLED** |

### `accounting_terminal_reservation_violations()`

Returns every `ACTIVE` reservation whose position is terminal, with product,
statuses, amount, reserved/settled timestamps and environment. Scoped to
journal-enabled products.

Wired in as Phase 10 invariant **#11**
`liability:no_active_hold_on_terminal_position` — a violation fails the suite
and carries full evidence rows in `detail.violations`.

### `accounting_repair_terminal_reservation(ref_type, ref_id, reason)`

Audited, admin-only, transactional. It:

- requires `accounting_caller_authorised()` and a reason of ≥ 8 characters;
- takes the environment advisory lock via `accounting_available_reserve_locked`
  so it cannot race a concurrent placement;
- **refuses** with `POSITION_STILL_ACTIVE` when the position is not terminal —
  a legitimate hold can never be released by this path;
- is a **safe no-op** when the reservation is already released
  (`idempotent_noop: true`, no audit noise, no balance change);
- releases through `accounting_release_liability` with reason
  `REPAIR_TERMINAL_<status>` — never a direct row edit;
- writes an `audit_log` entry with correlation id, actor, before/after status
  and available-reserve before/after;
- resolves any open `operational_alerts` row for that reference and files an
  `info` record of the repair.

Never used for the incident above: the position was not terminal, so the
correct fix was the product's own expiry path. The function exists for genuine
stranded holds.

---

## 3. No-payout settlement recognition can no longer misclassify

Previously `accounting_pl_report` booked a realised loss whenever a
`STAKE_PLACED` journal had no settlement journal but its hold had been
released. Any void, refund, reversal, expiry or cleanup release could be
counted as house profit.

A zero-payout position is now recognised as a **loss** only when **all** hold:

1. no `PAYOUT_SETTLED`, `REFUND` or `VOID` journal exists;
2. the position itself is **terminal**;
3. its explicit outcome is `LOSS`;
4. **no `ACTIVE` reservation remains** for the reference.

Everything else is classified explicitly and reported per product:

```
settled_outcomes = { win, loss, push, void, reversed, cancelled }
unclassified_positions = terminal-but-unknown releases (never booked as loss)
```

`unclassified_positions` surfaces in the admin P/L table as an amber `+n?`
badge next to the settled count; `settled_outcomes` is the column tooltip.

Live verification (400-day window, PRODUCTION, settlement basis):

| Product | Realised P/L | Settled | win / loss / void | Unclassified |
| --- | --- | --- | --- | --- |
| Plinko | 2.10 | 101 | 41 / 20 / 40 | 0 |
| Treasure Grid | 34.00 | 8 | 2 / 6 / 0 | 0 |
| Blackjack | 20.00 | 2 | 0 / 2 / 0 | 0 |
| **Total** | **56.10** | | | **0** |

56.10 equals the journal-backed arcade P/L exactly, and Plinko's outcome split
matches the raw table (`WIN 42 / LOSS 23 / VOID 40`, with one pre-journal game).

---

## 4. Bankroll authority — every surface reads the journal

Canonical source: `accounting_account_balances.HOUSE_BANKROLL`, read through
`readAuthoritativeBankroll()` (`src/lib/accounting/bankroll-source.server.ts`).
`platform_bankroll` (id = 1) is **LEGACY** — written only by legacy sports
settlement — and is displayed for reconciliation only.

| Surface | Source |
| --- | --- |
| `/management/admin` overview | authoritative (caption names the journal) |
| Bankroll page (`bankroll.functions.ts`) | authoritative, legacy shown side by side |
| Risk dashboard (`risk.functions.ts`) | authoritative; legacy row is only a config/availability gate |
| Admin risk overview | authoritative |
| Operations: overview, alerts, summary | authoritative, legacy fallback only if the RPC fails |
| P/L report | journal-only |

`accounting_bankroll_reconciliation()` now also returns
`journal_backed_arcade_pl`, `unexplained_difference` and
`reconciliation_status`:

```
house_bankroll            51,993.25   (authoritative)
payouts_payable            1,402.95
active_reserved_liability      0.00
available_reserve         50,590.30
legacy platform_bankroll  51,937.15
delta journal − legacy        56.10
journal_backed_arcade_pl      56.10
unexplained_difference         0.00   →  RECONCILED
```

The whole delta is explained arcade play. Any future difference beyond
journal-backed arcade P/L is drift, not expected divergence.

---

## 5. Permanent tests and alerts

### Scheduled jobs added

| Job | Schedule | Purpose |
| --- | --- | --- |
| `blackjack-expire-hands` | `* * * * *` | closes abandoned hands — removes the root cause |
| `accounting-liability-integrity` | `*/10 * * * *` | `critical` alert on any stranded hold (6 h dedupe) |
| `accounting-bankroll-drift` | `0 * * * *` | `critical` alert on unexplained journal-vs-legacy drift (6 h dedupe) |

### `accounting_phase101_selftest()` — 8/8

1. no active hold on a terminal position
2. repair rejects an unknown reference
3. repair requires a substantive reason
4. repair retains its non-terminal guard, idempotency, locking and audit trail
5. P/L zero-payout recognition is outcome-driven, hold-aware
6. bankroll reconciliation status is `RECONCILED`
7. no unclassified settled positions
8. no stale open Blackjack hands

### `accounting_phase10_invariants()` — 13/13

Unchanged twelve checks plus
`liability:no_active_hold_on_terminal_position`.
