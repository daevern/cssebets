# 100-Point Campaign Bonus — Two Eligibility Groups + Locked Bonus Wallet

## What I found first

- There is **no existing bonus implementation** in the codebase (no bonus tables, no bonus server functions). This is a build-from-scratch feature on top of the existing wallet/journal stack, not an edit of prior campaign code.
- `wallets` has a single `balance` column only — there is currently no separation between withdrawable and non-withdrawable funds.
- Money already moves through `wallet_apply_change`, `place_bet_atomic`, sports/arcade settlement RPCs and the double-entry ledger (`accounting_post_journal`, `accounting_reserve_liability`), with idempotency keys and immutability triggers. All new money movement will reuse these paths.
- "Approved member" already exists as a gate (`user_roles` = member/admin/super_admin) and is used before any wager.
- Demo/guest accounts are `auth_provider = 'anonymous'` and simulation accounts are flagged — both are excluded from the campaign.

Confirmed decisions: approved members only; bonus never expires; forfeited new-user slots are reassigned to the next valid new account.

## Campaign rules being implemented

- Campaign start: **2026-08-20 00:00:00 Asia/Kuala_Lumpur** (2026-08-19 16:00 UTC).
- **Group A** — accounts created before start: one-time 100 locked points on first login on/after start (once approved).
- **Group B** — first **100** valid accounts created on/after start, ordered by `created_at`, then user id: slot reserved atomically at signup, bonus awarded on first login after approval.
- One award per user, ever, across both groups. Maximum 100 points.

## Locked bonus wallet model

The wallet splits into three trusted server-side figures:

```text
total balance = withdrawable balance + locked bonus balance + reserved (pending) balance
```

- Locked bonus is non-withdrawable and non-transferable, usable for sports and arcade wagers.
- Every wager records its funding split (withdrawable / locked bonus) at placement time; the split is stored, never re-derived from later balances.
- Win settlement: withdrawable-funded principal → withdrawable; bonus-funded principal → locked bonus; **all profit → withdrawable**.
- Loss: the bonus-funded stake is consumed from locked bonus.
- Mixed-funded wagers keep principal and profit apportioned by the original composition.
- Withdrawal allowed only when withdrawable ≥ 100 **and** total ≥ 200; minimum request 100; deducted only from withdrawable.

## Database changes (backward-compatible migrations)

1. `wallets`: add `locked_bonus_balance numeric NOT NULL DEFAULT 0` (existing `balance` stays the **withdrawable** balance, so every current balance and history row is unchanged).
2. `bonus_campaigns` — campaign id, code, start timestamp, bonus amount, new-user cap (100), `reassign_forfeited_slots boolean DEFAULT true`, enabled flags for admin/sim/test accounts (default false), environment.
3. `bonus_campaign_enrolments` — campaign id, user id, eligibility group (`EXISTING_USER` / `NEW_USER`), slot number (1–100, null for Group A), account created at, slot reserved at, awarded at, bonus amount, remaining locked bonus, status (`ELIGIBLE`/`SLOT_RESERVED`/`AWARDED`/`FORFEITED`/`EXPIRED`/`INELIGIBLE`), journal id, idempotency key.
   - Unique `(campaign_id, user_id)` — one enrolment per user across both groups.
   - Partial unique `(campaign_id, slot_number)` for live (non-forfeited) slots, so a forfeited slot can be reassigned but two live users can never share a slot.
   - Unique `idempotency_key`.
4. `bonus_slot_audit` — append-only record of reserve / award / forfeit / reassign events with actor and reason.
5. `wager_funding` — per-wager funding composition (bet id, sport/arcade product, withdrawable amount, bonus amount, settlement outcome, returned amounts), written inside the same transaction as the bet.
6. Chart-of-accounts additions: `BONUS_LIABILITY` (locked bonus owed to users) and `BONUS_EXPENSE`, so every award and consumption posts a balanced journal.
7. RLS + grants: users may read only their own enrolment row and their own wallet split; **no** client role may insert or update enrolments, slots or `locked_bonus_balance`. All mutation happens in `SECURITY DEFINER` functions callable by service role only.

### Concurrency-safe slot allocation

A `SECURITY DEFINER` function `bonus_reserve_new_user_slot(user_id)` runs in one transaction:

- Takes a campaign-level advisory/row lock (`SELECT ... FOR UPDATE` on the campaign row) before counting live slots.
- Assigns the lowest free slot number (reusing forfeited slots when reassignment is enabled), stops at 100.
- Never uses an unlocked `COUNT(*) < 100`; never accepts a client-supplied timestamp or slot number.

Called from a signup-side server hook, never from a client request.

## Server functions

- `bonus.functions.ts`
  - `claimCampaignBonus` (authenticated) — called once on login; resolves the user's group, verifies approved member + non-anonymous + non-simulation + non-admin, and awards idempotently via `existing_user_bonus_20260820:{user_id}` / `new_user_bonus_20260820:{user_id}`. Concurrent calls collapse on the unique idempotency key.
  - `getCampaignStatus` (public) — remaining slots and offer visibility only; no user details.
  - `getMyWalletBreakdown` — total, withdrawable, locked bonus, reserved, withdrawal eligibility and progress toward 100/200.
- Award path posts a balanced journal (`BONUS_GRANT`) and increments `locked_bonus_balance`; no direct table writes.
- Bet placement (sports `place_bet_atomic` path, arcade stake path): compute funding split server-side (bonus consumed first), write `wager_funding`, reserve liability as today.
- Settlement (sports + arcade): return principal to its original bucket, credit profit to withdrawable, update `remaining_locked_bonus`, all journalled.
- Withdrawal (`payout.functions.ts` + its RPC): server-side re-validation of the ≥100 withdrawable / ≥200 total / ≥100 minimum rules, deducting only withdrawable, with the exact validation messages from the brief.
- Forfeit path: purge/fraud/deletion flows mark the enrolment `FORFEITED`, write audit, and free the slot for reassignment.

## UI changes

- One-time award modal per group with the specified copy plus the supporting bonus-terms paragraph.
- Wallet page: total / withdrawable / locked bonus / reserved, withdrawal eligibility state, and progress bars toward 100 withdrawable and 200 total.
- Cashout sheet: inline blocking messages using the exact validation strings.
- Bet slip: shows how much of the stake is bonus-funded.
- Landing/registration: "Limited offer: 100-point bonus for the next 100 new users" with live remaining count, shown only while server data says slots remain.

## Tests

Vitest + SQL/concurrency tests covering the full list in the brief: first-login award per group, no double award, 100-slot cap, 101st user denied, simultaneous registration never exceeding 100 slots, deterministic ordering, mutual exclusivity of groups, refresh/multi-device idempotency, forfeit + reassignment, exclusion of admin/test/simulation/guest accounts, non-withdrawable enforcement, losing/winning/mixed-funded settlement splits, withdrawal threshold failures and a valid withdrawal deducting only withdrawable funds. Existing sports and arcade accounting tests must continue to pass.

## Rollout

Migrations are additive and default-off behaviour for existing balances; the campaign row is inserted with the 2026-08-20 start so Group A awards begin on the next login after deploy. A short implementation report follows the build: schema, functions, cap enforcement, UI, security rules and test results.
