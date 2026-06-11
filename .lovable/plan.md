# Phase 1 & 2 — Security, Integrity, and Data Model Hardening

This is a large body of work. I'll deliver it in **two migrations + one app-code pass per phase**, validating after each step so nothing regresses for live users.

---

## Phase 1 — Critical Security & Accounting Integrity

### 1.1 Secure bet placement (`place_bet_atomic`)
- Drop the `p_user_id` argument. Replace it with `auth.uid()` read inside the function. Reject if NULL.
- Re-create as `SECURITY INVOKER` where possible; keep `SECURITY DEFINER` only for the cross-table writes, but always gate by `auth.uid()`.
- Update `src/lib/predictions.functions.ts` to stop sending `p_user_id` (server function already authenticates via `requireSupabaseAuth`).
- Same treatment for: `wallet_approve_request`, `wallet_reject_request`, `payout_approve_atomic`, `payout_user_reject_atomic`, `set_house_user`, `reset_simulation_data`, `update_platform_settings` — derive admin/user id from `auth.uid()` instead of trusting `p_admin_id` / `p_user_id`.

### 1.2 Atomicity
- Audit `place_bet_atomic`, `settle_match_atomic`, `void_match_atomic`, `wallet_apply_change`, `platform_apply_change`, `pool_apply_change` — they already run inside a single PL/pgSQL transaction. Verify lock order (match → pool → wallet → bankroll) is consistent everywhere to avoid deadlocks. Add explicit `FOR UPDATE` where missing.

### 1.3 Idempotency
- Bet placement already uses `client_request_id`. Extend with a UNIQUE index on `(user_id, client_request_id)` if not present.
- Add idempotency to:
  - `wallet_approve_request` / `wallet_reject_request` — guarded by `status='pending'` row lock (already partially in place; verify).
  - `payout_approve_atomic` — same.
  - `settle_match_atomic` — already guarded by `match_stake_pools.settled`. Verify.
  - `void_match_atomic` — guarded by `status<>'cancelled'`. Add explicit check.
  - `platform_apply_change` — add optional `p_external_ref` UNIQUE to prevent double credit on retried admin top-ups.

### 1.4 Settlement & Void correctness
- Re-running `settle_match_atomic` must short-circuit when pool is `settled=true` (already true — confirm).
- `void_match_atomic` must refund from pool if not yet drained, from bankroll if already settled. Already implemented — add a "void cannot follow settle for finished matches" guard unless explicitly forced.

### 1.5 RLS hardening
Audit and tighten policies for: `profiles`, `wallets`, `wallet_transactions`, `predictions`, `matches`, `point_requests`, `payout_requests`, `audit_log`, `platform_bankroll`, `platform_transactions`, `match_stake_pools`, `match_pool_transactions`, `match_odds_snapshots`, `platform_settings`, `tournaments`, `tournament_outrights`, `user_roles`.

Rules enforced:
- Users `SELECT` only their own private rows.
- Users `INSERT` only with `user_id = auth.uid()`.
- Users **never** `UPDATE/DELETE` wallets, balances, predictions after creation, or admin tables.
- Admin/super_admin checks go through `private.has_role(auth.uid(), …)` — never client claims.
- `platform_bankroll`, `platform_transactions`, `match_stake_pools`, `audit_log`: read = admin only, write = service_role only.

### 1.6 Storage security (`point-request-proofs`, `payout-proofs`)
- Policies on `storage.objects`:
  - Path convention `{auth.uid()}/...` enforced via `(storage.foldername(name))[1] = auth.uid()::text`.
  - Users INSERT/SELECT only their own folder. No UPDATE/DELETE by users.
  - Admins SELECT all.
- File-type + 10MB limit enforced client-side (server-side limit is bucket setting).

### 1.7 UI double-submit protection
- Audit submit handlers in: `wallet.tsx`, `payout.tsx`, `matches.tsx` (bet placement), `admin-wallet.tsx`, `admin-payout.tsx`, `admin.matches.tsx`, `admin.bankroll.tsx`, `admin.risk-settings.tsx`.
- Standardize on `useMutation` + `disabled={isPending}` + sonner toasts. Add a single `client_request_id` (uuid) per attempt where applicable.

---

## Phase 2 — Data Model Cleanup

### 2.1 Migrations
- I will **not** rewrite history (migrations are append-only in production). Instead, I'll add one consolidating migration that:
  - Drops any orphaned/duplicate policies discovered during the audit.
  - Re-asserts canonical CHECK constraints and indexes.
  - Is safe to re-run (uses `IF NOT EXISTS` / `DROP POLICY IF EXISTS`).

### 2.2 Constraints
- `wallets.balance >= 0` (CHECK).
- `predictions.virtual_stake > 0`, `reference_odds >= 1`, `potential_return >= 0`.
- `predictions.status` already enum — confirm.
- `point_requests.requested_amount > 0`.
- `platform_bankroll` row 1: allow negative (per current design) — leave as is, add comment.
- `match_stake_pools` totals `>= 0`.
- Settlement-once guard: partial UNIQUE index on `match_stake_pools(match_id) WHERE settled = true` is implicit (PK is match_id).

### 2.3 Indexes
- `predictions(user_id, created_at DESC)`
- `predictions(match_id, status)`
- `wallet_transactions(user_id, created_at DESC)`
- `point_requests(status, created_at DESC)`
- `matches(status, kickoff_at)`
- `audit_log(action, created_at DESC)`
- `match_odds_snapshots(match_id, sampled_at DESC)`
- `platform_transactions(transaction_type, created_at DESC)`

---

## Execution order

1. **Migration A** — Phase 1.1, 1.3, 1.5, 1.6, 2.2, 2.3 (DB-only: function signatures, RLS, constraints, indexes). Submit for your approval.
2. **App code pass** — update every server function and client mutation to match the new `place_bet_atomic` / approve/reject signatures, plus UI disabled-while-pending + toasts.
3. **Migration B** (optional, if audit finds orphaned policies) — cleanup pass.
4. Verify: build, run `supabase--linter`, smoke-test bet placement / approval / settlement flows.

## Risks / call-outs

- Changing `place_bet_atomic`'s signature is a **breaking RPC change**. All callers will be updated in the same turn, but any in-flight bets at deploy time will get a single retryable error.
- Removing `p_admin_id` from approve/reject RPCs means admins must be signed in as themselves (no impersonation) — that's the intended security posture.
- RLS tightening on `wallet_transactions` / `platform_*` will break any admin UI page that currently reads via the user's session instead of the admin server fn. I'll update those to go through admin server fns.

**Confirm and I'll start with Migration A.**
