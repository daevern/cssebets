
## Outcome

Users and admins get real phone-level notifications (OS notification tray + email) for every critical event, so nobody has to sit on the admin page or refresh the app to know their request was approved. No WhatsApp, SMS, Telegram, or marketing — Phase 1 is Web Push + Email only.

## Events wired up

**Admin (all admins, deep-links to correct admin page):**
- New user registration awaiting approval → `/management/admin/users`
- New top-up (point) request → `/management/admin/points`
- New cashout/payout request → `/management/admin/payouts`
- New support message → `/management/admin/support-ops`

**User (deep-links to relevant user page):**
- Account approved / rejected → `/dashboard` or `/auth`
- Top-up approved / rejected → `/wallet`
- Cashout approved / rejected / completed → `/payout`
- Support reply received → `/support`

## Firing rule (non-negotiable)

Notifications are dispatched **only after the database transaction commits successfully**, from inside the server function that made the change — never from a frontend `onClick`. Pattern:

```
admin clicks Approve
  → server fn runs DB update
  → on success: insert notification_event row
  → fan-out worker sends Web Push + Email
  → log result back into notification_event
```

If any channel fails, the event row is marked `failed` with `error_message` and retried by the worker; DB state is never coupled to notification success.

## PWA install experience

- **Manifest** (`public/manifest.webmanifest`): name `CSSEBets`, short_name `CSSE`, `display: standalone`, `theme_color` = existing green (`--color-neon`), `background_color` matches dark theme. Icons (192, 512, maskable) generated from the CSSE logo.
- **Dedicated push service worker** (`public/push-sw.js`) — messaging worker only, no offline caching, so it stays safe in Lovable preview per the PWA skill.
- **Install prompt card** shown once after first successful login or registration:
  - Title: *"Never miss an update"*
  - Body: the copy you specified (account approval, top-ups, cashouts, support replies)
  - Buttons: **Install CSSEBets** / **Not Now**
  - Android/desktop: fires the captured `beforeinstallprompt` event
  - iPhone Safari: shows an inline step-by-step ("Tap Share → Add to Home Screen")
  - Dismissal stored in `localStorage` + `profiles.install_prompt_dismissed_at`; won't re-nag for 30 days, and never again once installed.
- After install (detected via `display-mode: standalone`), the app requests Notification permission with a single friendly explainer sheet, then subscribes to Web Push.

## Notification payload rules (security)

Every push and email uses only the safe copy you listed. Payloads never include:
- Bank account numbers, payment references
- Wallet balances, points amounts
- Email addresses, phone numbers
- Other users' identifying info

Example admin push: `New Top-up Request — A new request is waiting for review.` (no user identity, no amount). Details are only visible after the admin logs in and lands on the deep-linked page.

## Database changes

New tables (single migration, with GRANTs + RLS):

- **`push_subscriptions`** — per-device subscriptions
  - `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at`, `last_seen_at`, `revoked_at`
  - RLS: user can read/insert/delete own; service_role full
  - Auto-cleanup: 410/404 responses from push service mark row `revoked_at`

- **`notification_events`** — append-only log (per your spec)
  - `id`, `recipient_user_id`, `event_type`, `related_record_type`, `related_record_id`, `payload jsonb`, `status` (`pending|sent|partial|failed`), `channel_results jsonb` (per-channel outcome), `created_at`, `sent_at`, `failed_at`, `error_message`
  - Doubles as the source for the in-app notification centre so push, email, and in-app stay in sync.

- **`notification_preferences`** — per-user toggles
  - `user_id` (pk), `push_enabled bool default true`, `email_enabled bool default true`, `updated_at`
  - Row auto-created via trigger on first `profiles` insert

Migration also enables Realtime on `notification_events` so the in-app bell updates instantly without a refetch.

## Dispatch layer

One server function everything funnels through:

```ts
// src/lib/notifications.functions.ts (server-only helpers in .server.ts)
dispatchNotification({
  recipientUserId,     // or 'all_admins'
  eventType,           // 'topup_approved' | 'payout_completed' | ...
  relatedRecordType,   // 'point_request' | 'payout_request' | ...
  relatedRecordId,
})
```

It:
1. Inserts a `notification_events` row (`status: pending`).
2. Looks up preferences and active `push_subscriptions`.
3. Renders the fixed safe copy for that `event_type` (title/body/deep-link URL).
4. Fans out in parallel: Web Push (via `web-push` npm with VAPID) and Email (existing Lovable Emails infra).
5. Marks 410/404 push endpoints `revoked_at`.
6. Updates the event row to `sent` / `partial` / `failed` with `channel_results`.

Call sites (existing server functions we hook into):
- Registration approval flow (currently in `admin.functions.ts` / profiles trigger area)
- `adminApproveRequest` / `adminRejectRequest` in `wallet.functions.ts` (top-ups)
- Payout approve/reject/complete in `payout.functions.ts`
- Support reply insert in `support.functions.ts`
- Support message create by user → notify admins
- Registration insert → notify admins
- Top-up submit / payout submit → notify admins

All call sites: `await dispatchNotification(...)` runs **after** the successful DB write, wrapped in try/catch that logs but never fails the parent action.

## Web Push infrastructure

- Generate VAPID keys once via `secrets--generate_secret`: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:admin@cssebets.com).
- Server: `web-push` package sends encrypted notifications.
- Client: `src/hooks/use-push-subscription.ts` handles permission flow, subscribes with the public key, POSTs to `subscribeDevice` server fn.
- `push-sw.js` handles `push` event → `showNotification()` with title/body/icon/deep-link URL in `data.url`; `notificationclick` opens/focuses that URL.

## Email infrastructure

Uses existing Lovable Emails setup (already scaffolded in this project per `src/routes/lovable/email/queue/process.ts`). We add new React Email templates:

- `account-approved.tsx`, `account-rejected.tsx`
- `topup-approved.tsx`, `topup-rejected.tsx`
- `cashout-approved.tsx`, `cashout-rejected.tsx`, `cashout-completed.tsx`
- `support-reply.tsx`
- `admin-new-request.tsx` (one template, `event_type` interpolated for subject/body — for the 4 admin events)

Each template uses cssebets dark/green branding, plain safe copy, and a single CTA button to the deep-link URL.

## User Settings — Notifications section

New panel in `/settings` (below existing panels, matching `StencilPanel` style):

- **Push Notifications** toggle (with "Enable on this device" button if permission not granted or device not subscribed)
- **Email Notifications** toggle
- Both default ON on account creation
- Shows list of registered devices with "Remove" button (unsubscribe + delete `push_subscriptions` row)

## Admin experience

- Admin users automatically get admin-scoped events regardless of push/email prefs UI (they can toggle their own in the same settings panel).
- Same install prompt applies — admins install the PWA on their own phone once, and every future submission pings them.
- Admin deep-links open the correct `/management/admin/...` page; if not authenticated, the existing `_authenticated` gate redirects to `/auth`, then back after login.

## In-app notification centre

Already exists (`src/components/notifications/useNotifications.ts`). We extend it to also read from `notification_events` so push, email, and in-app show the same message set. Realtime subscription auto-invalidates the query on new events.

## Files touched (technical)

**New:**
- `public/manifest.webmanifest`, `public/push-sw.js`
- `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (generated)
- `src/hooks/use-push-subscription.ts`
- `src/components/pwa/InstallPrompt.tsx`, `src/components/pwa/PermissionSheet.tsx`
- `src/components/settings/NotificationSettings.tsx`
- `src/lib/notifications.functions.ts` (client-callable: subscribeDevice, unsubscribeDevice, updatePreferences, dispatch is internal)
- `src/lib/notifications.server.ts` (dispatch, web-push send, email send wrapper, admin recipient lookup)
- `src/lib/email-templates/account-approved.tsx` + 8 other templates
- Migration: `push_subscriptions`, `notification_events`, `notification_preferences` + RLS + GRANTs + realtime publication + preferences auto-create trigger
- Secrets: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (generated), `VITE_VAPID_PUBLIC_KEY` mirror for client subscribe

**Edited (add one `dispatchNotification` call after successful DB write, plus tiny copy tweaks):**
- `src/lib/wallet.functions.ts` (approve/reject point request; submit point request → admin)
- `src/lib/payout.functions.ts` (approve/reject/complete; submit → admin)
- `src/lib/admin.functions.ts` (registration approve/reject)
- `src/lib/support.functions.ts` (staff reply → user; user message → admin)
- `src/routes/_authenticated/settings.tsx` (mount `<NotificationSettings />`)
- `src/routes/__root.tsx` (register push service worker; mount install prompt after auth)
- `src/routes/register.tsx` / `src/routes/auth.tsx` (trigger install prompt after first successful sign-in)
- `bun add web-push` (server) and add `@types/web-push`

## Out of scope (as you said)

- WhatsApp, SMS, Telegram
- Marketing/promo notifications
- Big-win / bet-settlement pings (not in your event list this phase)
- Auto-approval of registrations (still manual — this plan solves the awareness gap instead)
- Offline app support / general-purpose service worker caching (push-only worker, per PWA skill)

## Rollout order (one build cycle)

1. Migration + secrets + email templates
2. Dispatch layer + hook into all server-fn call sites
3. Push infrastructure (VAPID, service worker, subscribe hook)
4. Manifest + icons + install prompt + iOS instructions
5. Settings panel
6. End-to-end verification: place a test top-up as a user in one browser, approve it as admin in another → confirm push arrives on phone with permission granted and email lands in inbox, all with safe copy only.
