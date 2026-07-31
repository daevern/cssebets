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
  p_to             := NULL,
  p_basis          := 'settlement',   -- 'settlement' | 'placement'
  p_products       := NULL,           -- text[] product filter
  p_game           := NULL,
  p_sport          := NULL,           -- 'sports' | 'arcade'
  p_user           := NULL,           -- uuid
  p_config_version := NULL
);
```

## Date basis

Each journal is attributed to a reporting date before filtering:

- **Settlement basis (default)** — a stake journal is attributed to the date its
  position settled. A stake with no settlement journal yet has no realised date
  and is excluded from realised P/L entirely; it appears only under pending.
- **Placement basis** — every journal for a position is attributed to the date
  the stake was placed.

## Platform block

Opening bankroll, closing bankroll, total stakes, gross payouts, refunds,
adjustments, realised P/L, open liability, available bankroll, actual hold %.

- Opening/closing bankroll read the `HOUSE_BANKROLL` running balance at the edges
  of the range.
- `realised_pl` = sum of product P/L + disclosed adjustments
  (`ADMIN_ADJUSTMENT`, `MIGRATION_ADJUSTMENT`, `ROUNDING_ADJUSTMENT`,
  `BONUS_EXPENSE`, `POINTS_EXPIRY`).
- `available_bankroll` = closing bankroll − active reserved liability.
- Actual hold % = product P/L ÷ stakes.

## Product blocks

Grouped into **sports** (football, UFC/MMA, F1, basketball, generic sports) and
**arcade** (Plinko, Mini Roulette, Treasure Grid, Blackjack). Products are read
from `accounting_migration_flags`, so a future game appears automatically once
its flag row exists.

Per product and per group total: stakes, gross payouts, refunds, realised P/L,
hold %, settled positions.

Per settled position: realised P/L = stake − gross payout. Voids and pushes
contribute 0 realised P/L — their refunds are reported in the refunds column,
not in P/L.

## Pending shown separately

Open stakes, reserved liability, maximum potential payout and pending position
count come from active rows in `accounting_liability_reservations`. They never
touch realised P/L.

## Journal coverage

`checks.products_not_yet_journal_backed` lists products still on the legacy path
(currently football, UFC, F1 and generic sports). Their realised columns read 0
and the UI tags them `legacy`, so a zero is never mistaken for "no activity".
Those figures populate automatically as each product's `journal_enabled` flag is
switched on.

## Consistency check

`checks.platform_pl_equals_products_plus_adjustments` asserts the Phase 9
formula: platform P/L = Σ product P/L + disclosed adjustments. The Phase 10
suite (`accounting_phase10_selftest`) covers the same identity over live data.
