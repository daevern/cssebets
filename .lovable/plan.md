## Cause

The `AUTH_REQUIRED` error is raised inside the Postgres RPCs `request_wallet_adjustment`, `approve_wallet_adjustment`, `reject_wallet_adjustment`, and `cancel_wallet_adjustment`. Each one starts with:

```sql
v_admin uuid := auth.uid();
IF v_admin IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
```

In `src/lib/wallet.functions.ts` these RPCs are called through `supabaseAdmin` (service-role client). The service-role client has no user JWT attached, so `auth.uid()` inside the SECURITY DEFINER function returns `NULL` → `AUTH_REQUIRED`.

The admin check already runs in the server function (`isAdmin(context.supabase, context.userId)` before the RPC), so the RPC just needs the user's identity so `auth.uid()` resolves to the admin.

## Fix

In `src/lib/wallet.functions.ts`, call the four maker-checker RPCs on the user-scoped `context.supabase` (which carries the admin's bearer token) instead of `supabaseAdmin`:

- `requestWalletAdjustment` → `context.supabase.rpc("request_wallet_adjustment", …)`
- `approveWalletAdjustment` → `context.supabase.rpc("approve_wallet_adjustment", …)`
- `rejectWalletAdjustment` → `context.supabase.rpc("reject_wallet_adjustment", …)`
- `cancelWalletAdjustment` → `context.supabase.rpc("cancel_wallet_adjustment", …)`

The RPCs are `SECURITY DEFINER` and do their own admin authorization (`_is_admin_maker_checker`), so switching the client doesn't weaken security — it just makes `auth.uid()` populated. Remove the now-unused `supabaseAdmin` imports inside those four handlers. Leave other `supabaseAdmin` uses (storage, listing rows, profile joins) untouched.

## Verification

Reproduce by opening `/management/admin/wallet-adjustments`, submitting an adjustment, and confirming no `AUTH_REQUIRED` — request lands in the `pending` queue and approval writes to `wallet_transactions`.