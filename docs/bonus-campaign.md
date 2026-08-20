# Launch bonus campaign — 100 locked points

Campaign `launch_bonus_20260820`, start `2026-08-20 00:00 Asia/Kuala_Lumpur`
(`2026-08-19 16:00 UTC`), bonus 100 points, new-user cap **100**.

## Groups

- **Group A — existing users**: `auth.users.created_at < starts_at`. Awarded on the
  first successful login on/after the start.
- **Group B — next 100 new users**: `created_at >= starts_at`. A slot is reserved
  server-side when the profile row is created (`bonus_profile_slot_trg`), ordered by
  `created_at` then `user_id`. The bonus is awarded on the first successful login.

A campaign-level unique constraint on `(campaign_id, user_id)` guarantees a user can
never hold both a Group A and a Group B enrolment, so the maximum is 100 points.

## Database

| Object | Role |
| --- | --- |
| `bonus_campaigns` | Campaign config: start, amount, cap, inclusion flags. |
| `bonus_campaign_enrolments` | One row per user: group, slot 1..100, timestamps, amount, remaining locked bonus, status, journal txn, idempotency key. Unique on `(campaign_id, user_id)` and on `(campaign_id, slot_number)` where not forfeited. |
| `bonus_slot_audit` | Immutable audit trail: reserved / denied / forfeited / awarded. |
| `bonus_wager_funding` | Per-wager funding composition (stake, bonus-funded, withdrawable-funded, returns, profit). |
| `wallets.locked_bonus_balance` | Non-withdrawable portion of the wallet. |

Functions (all `SECURITY DEFINER`, `EXECUTE` revoked from `anon`/`authenticated`):
`bonus_active_campaign`, `bonus_user_is_valid`, `bonus_user_is_approved`,
`bonus_reserve_new_user_slot`, `bonus_claim_for_user`, `bonus_forfeit_slot`,
`bonus_campaign_status`.

### Cap enforcement

`bonus_reserve_new_user_slot` takes `SELECT … FOR UPDATE` on the campaign row before
picking the lowest free slot from `generate_series(1, cap)`, so simultaneous
registrations serialise and slot 101 can never be issued. Eligibility is never derived
from a client-supplied count or an unlocked `COUNT(*)`.

### Idempotency

`existing_user_bonus_20260820:{user_id}` / `new_user_bonus_20260820:{user_id}`, unique
per campaign. Repeated logins, refreshes and multiple devices return
`{ awarded: false, already: true }`.

### Locked-money rules (`wallets_bonus_split` trigger)

- Bonus credit → locked balance increases.
- Wager debit → bonus money is consumed first; the composition is written to
  `bonus_wager_funding` at stake time, never inferred later.
- Settlement credit → principal returns to its original bucket (bonus principal stays
  locked), profit is credited as withdrawable.
- Payout/withdrawable contexts raise `BONUS_LOCKED_FUNDS` if they would touch locked money.

### Withdrawals (`payout_create_atomic`)

`MIN_WITHDRAWAL_100`, `INSUFFICIENT_WITHDRAWABLE` (< 100 withdrawable),
`INSUFFICIENT_TOTAL` (< 200 total). Withdrawable =
`balance − locked_bonus_balance − pending payouts`. Only withdrawable funds are deducted.

## Server functions

`src/lib/bonus.functions.ts` — `getCampaignStatus` (public, aggregate only),
`claimCampaignBonus` (auth, idempotent), `getMyWalletBreakdown`, `getMyBonusEnrolment`.
`src/lib/payout.functions.ts` maps the SQL errors to the user-facing messages.

## UI

- `BonusAwardModal` (mounted in the authenticated layout) claims once per session and
  shows the Group A / Group B message a single time.
- `WalletBreakdownPanel` on `/wallet`: total, withdrawable, locked bonus, reserved,
  eligibility and progress to 100 / 200.
- `CashoutSheet` uses withdrawable funds only, enforces the 100 minimum and shows an
  "not yet eligible" screen with the exact reason.
- `BonusOfferBanner` on `/register` shows remaining slots from trusted server data only
  while slots remain.

## Tests

`e2e/bonus-campaign.spec.ts` (Playwright + service role) covers: single award per
existing user, concurrent-login dedupe, ordered slot allocation, hard cap under
simultaneous registration, denial past the cap, forfeit + reassignment with audit,
admin/simulation/unapproved exclusion, losing bonus wager consumption, winning wager
returning locked principal with withdrawable profit, mixed funding composition, and all
withdrawal gates. It runs in the e2e workflow, which supplies the service-role key;
it cannot run in the editor sandbox because that key is not available there.
