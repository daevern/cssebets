## Admin Management Dashboard

Build a dedicated admin area on top of the existing pool app. Virtual credits only — no real money, deposits, withdrawals, payments, or bookmaker profit math.

### Roles
Extend the `app_role` enum with `super_admin` and `viewer` (keeping existing `admin`, `member`, `pending`).
- **super_admin**: everything, including role changes and destructive actions
- **admin**: day-to-day moderation (settle, void, suspend, edit names, reset balance)
- **viewer**: read-only access to all admin screens

Helper `private.has_any_admin_role(uid)` for gating; `private.has_role(uid,'super_admin')` for sensitive actions.

### Security
- Sensitive server fns (role change, reset balance, suspend, void, manual settle) require a fresh password re-auth token (sign in with email+password again within the last 5 min). Stored as `admin_reauth` row keyed by user, with `expires_at`.
- 2FA placeholder: a toggle on the admin profile that just records intent (no enforcement yet) — clearly labeled "Coming soon".
- Every mutating admin action writes to `audit_log` with: admin_id, action, entity, entity_id, old_value, new_value, reason (required for sensitive ops), ip placeholder, user_agent placeholder, timestamp.

### Routes (under `/_authenticated/admin/`)
```text
/admin                  -> overview (metrics cards)
/admin/users            -> user table + search + drawer
/admin/predictions      -> predictions table + filters
/admin/matches          -> matches table + manual controls
/admin/audit            -> audit log table
/admin/settings         -> reauth, 2FA placeholder, role list (super_admin only)
```
Shared `AdminLayout` with a left sidebar (collapsible on mobile). Existing `/admin` page is replaced.

### Pages

**Overview** — metric cards:
- Total users, active users (24h), total predictions, total virtual stake, total virtual payouts, net movement, unsettled count, voided count
- Top 5 virtual winners + top 5 losers (by lifetime points)
- Match-by-match exposure table (virtual stake totals per market per match)

**Users** — search by display_name; columns: name, roles, balance, predictions count, status. Row drawer with: prediction history, balance, actions (rename, suspend/unsuspend, reset balance to default, promote/demote — super_admin only). Reason required on every action.

**Predictions** — filters: user, match, market, status. Columns: user, match, market, outcome, stake, odds ref, status, placed_at, settled_at. Actions: void (with reason), manual settle pass-through to match.

**Matches** — list with status pills. Actions: refresh fixtures (existing sync), refresh single match score, set status manually, settle (existing flow).

**Audit log** — filterable table of all entries.

**Settings** — password re-auth form (issues 5-min token), 2FA placeholder toggle, role assignments list (super_admin only).

### Server functions (new file `src/lib/admin-dashboard.functions.ts`)
All guarded by `requireAdminRole(['admin','super_admin','viewer'])` for reads and stricter sets for writes. Sensitive writes also call `requireFreshReauth(userId)`.

- `getAdminMetrics`
- `listUsersAdmin({ search, limit, offset })`
- `getUserDetail({ userId })`
- `updateUserDisplayName({ userId, name, reason })`
- `setUserSuspended({ userId, suspended, reason })`
- `resetUserBalance({ userId, reason })`
- `setUserRole({ userId, role, reason })` — super_admin only
- `listPredictionsAdmin({ filters })`
- `voidPrediction({ predictionId, reason })`
- `refreshMatchScore({ matchId })` — single-match football-data fetch
- `setMatchStatus({ matchId, status, reason })`
- `listAuditLog({ filters })`
- `issueReauth({ password })` / `getReauthStatus()`
- `setTwoFactorPlaceholder({ enabled })`

### Database (single migration)
1. `ALTER TYPE app_role ADD VALUE 'super_admin'; ADD VALUE 'viewer';` (if absent)
2. Seed: promote existing `admin`s by inserting `super_admin` for one bootstrap user (the first admin) so the dashboard isn't locked out.
3. `profiles` add `suspended boolean default false`.
4. New table `public.admin_reauth(user_id pk fk auth.users, issued_at, expires_at)` — RLS: row owner only.
5. Extend `audit_log` with `old_value jsonb`, `new_value jsonb`, `reason text`, `ip text`, `user_agent text` (nullable, additive).
6. `private.has_any_admin_role(uid)` helper.
7. RLS policies updated where needed so viewers can read user/prediction/match/audit data via admin server fns (server fns use `supabaseAdmin`, so RLS is bypassed — keep public RLS unchanged for normal users).
8. GRANTs included for all new tables; `EXECUTE` revoked from anon/PUBLIC on all new SECURITY DEFINER funcs.

### Auto-settle & locking (already partly present)
- Predictions are blocked post-kickoff in `placePrediction` — confirm and keep.
- Auto-settle continues via existing `settlePredictionsForMatch` on sync.

### Design
- Sidebar: dark surface, items: Overview, Users, Predictions, Matches, Audit, Settings. Collapses to icons on `<md`.
- Cards: muted background, large numeric, small label, trend hidden for now.
- Tables: shadcn `Table`, sticky header, row hover, drawer for details.
- All semantic tokens; no hardcoded colors.

### Out of scope (per request)
No deposits, withdrawals, cashout, payment, real-money wallet, or bookmaker profit calculations.

### Technical notes
- Reuses `wallet_apply_change` for balance reset (debit/credit to a target default of 1000).
- Single migration; followed by code changes.
- Replaces current `src/routes/_authenticated/admin.tsx` with `admin.index.tsx` (overview) + new child routes under `admin/`.
