## Problem

Push/email notifications fire correctly for top-up and cashout approvals, but not for account approval. Cause: approvals go through **two** server functions, and only one dispatches:

- `approveUser` in `src/lib/admin.functions.ts` — calls `dispatchNotification("account_approved")` ✅
- `staffApproveUser` in `src/lib/management.functions.ts` — used by the `/management/support` dashboard (the panel actually being used to approve pending users) — **never dispatches** ❌

`staffRejectUser` has the same gap for `account_rejected`.

## Fix

In `src/lib/management.functions.ts`:

1. In `staffApproveUser.handler`, after the successful role upsert and audit (and only when not `alreadyApproved`), dynamically import `dispatchNotification` and dispatch:
   - `eventType: "account_approved"`
   - `recipientUserId: data.targetUserId`
   - `relatedRecordType: "user"`, `relatedRecordId: data.targetUserId`

2. In `staffRejectUser.handler`, after the profile suspend + audit, dispatch:
   - `eventType: "account_rejected"` (already handled in `copyFor` inside `notifications.server.ts`)
   - same recipient/related fields, with `payload: { reason: data.reason }` so the copy can reference it if needed

Both calls wrapped so a notification failure never breaks the approval (dispatch already swallows errors internally, but keep the awaits after the DB writes as elsewhere).

No schema, UI, or template changes needed — the `account_approved` / `account_rejected` events already exist in `notifications.server.ts` and the email template renders them.

## Verification

After the change, approving a pending user from `/management/support` should:
- Insert a row in `notification_events` with `event_type = "account_approved"`
- Deliver a push to that user's enrolled device and an email if enabled
