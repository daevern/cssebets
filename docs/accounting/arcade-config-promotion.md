# Arcade configuration promotion & rollback

Target house edges (v2): Blackjack 1.50%, Plinko 4.00%, Rock–Paper–Scissors 5.00%.

## Current pinning

| Product | PRODUCTION | SIMULATION | TEST |
| --- | --- | --- | --- |
| plinko | v1 | v2 | v2 |
| rps | v1 | v2 | v2 |
| blackjack | v1 | v2 | v2 |

Resolution goes through `arcade_config_version_for(product, user)` →
`arcade_config_version_in_env(product, environment)`. A product with no activation row
for the caller's environment raises `ARCADE_CONFIG_NOT_ACTIVATED` — it never silently
falls back to another environment or to "latest active".

## Guarantees

- **Pinned at creation.** Every round stores the config it was created with
  (`arcade_rps_rounds.config_id/config_version`, `arcade_bj_hands.rule_config_id`,
  `arcade_plinko_games.profile_id`). Settlement reads that stored row, never the
  currently-active one, so flipping activation mid-round cannot change a payout.
- **Immutable.** Triggers on `arcade_rps_rounds` and `arcade_plinko_games` reject any
  change to the pinned config, raising `ROUND_CONFIG_IMMUTABLE`.
- **Authorised only.** `arcade_promote_config` / `arcade_rollback_config` require an
  admin caller and write to `arcade_config_activation_log`.
- **Exposure enforced.** `accounting_migration_flags.capacity_enforced = true` for
  plinko, rps and blackjack; every stake path asserts capacity before debiting.

## Pre-promotion checklist

1. `select * from public.arcade_config_selftest();` — all rows `passed = true`.
2. `bunx vitest run src/lib/arcade/__tests__` — 77 tests green (v1 and v2 math both
   asserted independently).
3. Confirm no open rounds are mid-flight for the product being promoted.

## Promote (manual, admin session)

```sql
select public.arcade_promote_config('rps', 'PRODUCTION', 2, 'v2 rollout — 5% edge');
```

Then re-run `arcade_config_selftest()` and spot-check one live round end-to-end.

## Roll back

```sql
select public.arcade_rollback_config('rps', 'PRODUCTION', 'reverting v2');
```

Rollback restores the previously activated version from
`arcade_config_activation_log`. Rounds created while v2 was active stay settled under
v2 — that is intentional and is what the immutability triggers protect.

## What promotion does NOT do

It does not touch historical rounds, journals, wallet balances or existing
reservations. Only new rounds created after the activation row changes pick up the new
version.
