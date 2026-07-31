# Phase 9 — Unified P/L Reporting

Everything in this report is derived from **posted accounting journals**
(`accounting_journals` + `accounting_journal_lines`), never from product tables.

- Database: `public.accounting_pl_report(...)` (admin-only, `SECURITY DEFINER`,
  read-only).
- Server function: `getPlReport` in `src/lib/accounting-report.functions.ts`.
- Admin UI: **Finance & risk → P/L report** (`/management/admin/pl-report`).

## Signature

```sql
SELECT public.accounting_pl_report(
  p_environment    := 'PRODUCTION',   -- PRODUCTION | SIMULATION | TEST
  p_from           := NULL,
  p_to             := NULL,           -- report boundary; also the "as of" date
  p_basis          := 'settlement',   -- 'settlement' | 'placement'
  p_products       := NULL,
  p_game           := NULL,
  p_sport          := NULL,           -- 'sports' | 'arcade'
  p_user           := NULL,
  p_config_version := NULL
);
```

## Available bankroll (Phase 6 authoritative formula)

```
available_bankroll = closing_house_bankroll
                   − outstanding payouts payable
                   − active enforced reserved liability
```

All four values are reported separately: `closing_bankroll`,
`payouts_payable_outstanding`, `active_reserved_liability`,
`available_bankroll`.

When the report has no `p_to` (a live report), the same
`public.accounting_available_reserve(env)` used by placement capacity checks is
called and cross-checked:
`checks.available_bankroll_matches_authoritative`. For a historical boundary the
figure is recomputed **as of** that timestamp with the identical formula (the
live function has no time argument), and
`platform.available_bankroll_basis = 'as_of'`.

## As-of liability and payables

Pending liability is never read from *current* reservation status. Reservations
are treated as open at the boundary when:

```sql
coalesce(reserved_at, created_at) <= as_of
AND (LEAST(released_at, superseded_at) IS NULL
     OR LEAST(released_at, superseded_at) > as_of)
```

`superseded_at` is included so re-reserved (versioned) positions are counted
exactly once at any point in time. A position that was active on 20 July and
settled on 21 July therefore still shows as open liability in a report through
20 July.

Payables use the same principle: `PAYOUTS_PAYABLE` is read from the balance
chain at the last journal posted on or before `p_to`, not the balance today.

`platform.pending.as_of` echoes the timestamp used.

## Two different, both-valid measures

Under settlement basis a stake journal is attributed to the settlement date,
while the bankroll movement physically happened on the placement date. The
report never asserts they are equal. It labels both and bridges them.

**Bankroll by journal posting date**

```
opening_bankroll + physical_bankroll_movement = closing_bankroll
```
(`reconciliation.bankroll_by_posting_date.identity_ok`)

**Timing bridge**

```
realised P/L by reporting attribution
− opening-position timing adjustment   (attributed into the range, posted before/after it)
+ closing-position timing adjustment   (posted in the range, attributed outside it)
+ out-of-scope house movement          (opening balances, reversals, filtered-out journals)
= actual bankroll movement
```
(`reconciliation.timing_bridge.bridge_ok`, plus
`pl_equals_attributed_house_movement`, which asserts realised P/L equals the
house-bankroll movement of the attributed journal set.)

The balance chain includes `REVERSED` journals as well as `POSTED` ones, because
a reversal posts its own entry and the original movement really did occur.

## Hold percentage

```
hold_pct = realised_product_pl / net_settled_stakes
net_settled_stakes = gross_stakes − refunded/void stakes
```

Voided and refunded stakes are excluded from the denominator, so heavy void
activity no longer depresses hold. `gross_stakes`, `refunded_stakes`,
`net_settled_stakes` and `gross_hold_pct` (hold on gross stakes) are all
disclosed alongside it.

## Refund classification

Each payout-expense line is classified exactly once by the journal type that
produced it:

| Journal type | Column |
| --- | --- |
| `PAYOUT_SETTLED` | gross payouts |
| `REFUND` / `VOID` | refunds |

A void therefore reads stake 10, refund 10, gross payout 0, realised P/L 0, and
its stake is removed from the hold denominator. Pushes are classified the same
way. `checks.refunds_not_double_counted` asserts
`gross_payouts + refunds = total payout expense`.

## Product discovery

Products come from the union of migration flags, journal activity in the range,
posted journals in the environment, and reservations — so a product that was
once journal-enabled and later disabled still appears in historical reports.
Migration flags supply only the current status label:

- `journal-enabled` — posting to the unified journal now
- `shadow` — dual-write, not yet authoritative
- `disabled` — has historical journal activity, currently off
- `legacy` — never journal-backed

## Checks returned

`platform_pl_equals_products_plus_adjustments`,
`available_bankroll_matches_authoritative` (live reports only),
`bankroll_identity_ok`, `timing_bridge_ok`, `refunds_not_double_counted`,
`products_not_yet_journal_backed`.

Phase 7 should consume `accounting_available_reserve` and the as-of reservation
predicate above rather than reimplementing either.
