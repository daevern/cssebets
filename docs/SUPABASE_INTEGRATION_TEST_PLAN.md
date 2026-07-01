# Supabase Integration Test Plan

## Goal

Unit tests in this branch pin production TypeScript validation, mapping, pricing, and RPC wrapper behavior. Full confidence for wallet, ledger, settlement, payout, RBAC, and audit behavior requires integration tests against a disposable Supabase database because the critical guarantees live in Postgres RPCs and row-level policies.

## Local/Test Supabase Setup

1. Install Supabase CLI.
2. Start a disposable local stack:

```bash
supabase start
supabase db reset
```

3. Run tests against local URLs only. Never point integration tests at production.

## Required Environment Variables

```bash
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_PUBLISHABLE_KEY=<local anon key>
SUPABASE_SERVICE_ROLE_KEY=<local service role key>
API_FOOTBALL_KEY=
ODDS_API_KEY=
```

External API keys should be empty for integration tests. API-Football and Odds API responses must be mocked.

## Tables/RPCs To Cover

Tables:
- `profiles`
- `user_roles`
- `wallets`
- `wallet_transactions`
- `point_requests`
- `payout_requests`
- `predictions`
- `matches`
- `match_market_odds`
- `match_odds_snapshots`
- `market_odds_snapshots`
- `platform_bankroll`
- `platform_transactions`
- `audit_log`
- `rate_limits`
- `apifootball_quota`
- `apifootball_odds_raw`

RPCs:
- `wallet_apply_change`
- `wallet_approve_request`
- `wallet_reject_request`
- `place_market_bet_atomic`
- `settle_match_all_markets_atomic`
- `void_match_atomic`
- `payout_approve_atomic`
- `payout_user_confirm`
- `payout_user_reject_atomic`
- `platform_apply_change`
- `run_reconciliation_check`
- `check_rate_limit`
- `apifootball_consume_quota`
- `regenerate_match_market_odds`
- `refresh_odds_status_for_open_matches`
- `has_role`

## Test Data Setup

Create deterministic users:
- member user with wallet balance
- member user with zero/low balance
- pending user
- viewer/support user
- admin user
- super_admin user

Create deterministic matches:
- scheduled match with trusted odds
- scheduled match with missing/stale odds
- locked/live match
- finished match with pending predictions
- finished match already settled

Create deterministic payouts/point requests:
- pending point request with proof
- pending payout
- approved payout awaiting proof
- proof uploaded payout awaiting user confirmation

## Cleanup/Rollback

Use a transaction per test when possible. If RPCs commit work outside test transactions, create namespaced test rows and delete them in reverse dependency order after each test. Run `supabase db reset` in CI for a clean database.

## Integration Test Cases

### Wallet / Ledger
- Credit points creates one wallet transaction and updates wallet balance.
- Debit points rejects insufficient balance and leaves wallet + ledger unchanged.
- Zero/negative amount rejected.
- Duplicate reference/client id is idempotent or rejected without duplicate ledger rows.
- Direct wallet balance drift is detected by `run_reconciliation_check`.

### Market Entry / Prediction Placement
- Valid entry creates prediction and debit ledger row atomically.
- Insufficient balance leaves no prediction and no ledger row.
- Duplicate `clientRequestId` does not create duplicate predictions.
- Locked, settled, stale-odds, disabled, and suspended markets reject.
- Client-provided odds/user_id are ignored; server derives user and odds.

### Settlement
- Pending entries settle win/loss/void correctly.
- Running settlement twice does not double-pay.
- Missing scores reject safely.
- Partial RPC failure cannot leave prediction status and wallet ledger inconsistent.
- Normal users cannot trigger admin retry settlement.

### Payout / Reward Requests
- Point request approve/reject state transitions are atomic and audited.
- Payout request rejects insufficient balance and duplicate active payout.
- Payout approval debits once and repeated approval cannot double debit.
- User confirm/reject transitions are owner-only and audited.

### RBAC / Permissions
- Logged-out callers blocked by middleware.
- Member cannot call admin write RPCs/server functions.
- Viewer/support can read only where intended and cannot write.
- Only super_admin can assign high-risk roles.
- Role changes require reauth and audit row.

### Audit Logs
- Wallet adjustment, role change, settlement retry/void, payout approval/rejection write audit rows.
- Audit rows include actor/action/entity/reason/old_value/new_value where applicable.
- Normal users cannot delete or mutate audit logs.

### API Imports
- API-Football sync handles success, empty response, malformed payload, timeout, rate limit, missing key and invalid key without live external calls.
- Provider labels map to expected markets.
- Bad provider data cannot auto-settle matches or unsuspend markets.
- Already settled records are not overwritten without explicit safe handling.
