
## Goal

Kill the "wait for admin approval" step. A user becomes **ACTIVE** the moment they finish email + phone verification (or Google + phone verification). Admin only gets involved when the signup looks suspicious (`SECURITY_REVIEW`) or for suspend/ban actions.

## Account status model

Add an `account_status` enum + column on `profiles`:

```text
REGISTRATION_INCOMPLETE
EMAIL_VERIFICATION_REQUIRED
PHONE_VERIFICATION_REQUIRED
ACTIVE
SECURITY_REVIEW
SUSPENDED
BANNED
```

Also add: `username` (unique, citext), `email_verified_at`, `phone_verified_at`, `google_linked_at`, `signup_ip`, `signup_device_fp`, `security_review_reason`.

Role assignment changes: on new signup we no longer create a `pending` role. Once status flips to `ACTIVE`, a DB trigger inserts the `member` role. `SUSPENDED` / `BANNED` / `SECURITY_REVIEW` gate the app via a new `has_active_status(uid)` SQL function used in RLS + the `_authenticated` gate.

## Verification codes

New table `verification_codes(id, user_id, channel [email|phone], destination, code_hash, expires_at, attempts, consumed_at, ip, created_at)`. Codes are 6 digits, hashed with `crypt()`, TTL 10 min, max 5 attempts, max 5 sends per hour per destination (reuses existing `rate_limits`).

Server functions in `src/lib/verification.functions.ts`:
- `sendEmailCode` — validates rate-limit + Turnstile token, generates code, sends via existing Lovable Emails (new template `verification-code.tsx`).
- `verifyEmailCode` — checks hash, marks `email_verified_at`, advances status.
- `sendPhoneCode` — validates rate-limit + Turnstile, sends SMS via **Twilio** connector gateway.
- `verifyPhoneCode` — checks hash, marks `phone_verified_at`, advances status; when both verified → `ACTIVE` (or `SECURITY_REVIEW` if any heuristic fires).

## Registration flow (email/password)

Rewrite `src/routes/register.tsx` as a 3-step stepper:

1. **Details** — username (live-check uniqueness), email, password. On submit: Turnstile → `supabase.auth.signUp` (no `emailRedirectTo`; we handle verification ourselves) → create profile with status `EMAIL_VERIFICATION_REQUIRED` → `sendEmailCode`.
2. **Email code** — 6-digit input; resend button (rate-limited).
3. **Phone** — E.164 input → `sendPhoneCode` → 6-digit input → on success, status flips to `ACTIVE`, redirect to `/dashboard` with toast "Your account has been verified successfully. Welcome to CSSEBets."

## Registration flow (Google)

Add "Continue with Google" button on `/auth` and `/register`. Enable Google via `supabase--configure_social_auth`. Flow:

1. `lovable.auth.signInWithOAuth("google", { redirect_uri: `${origin}/auth/callback` })`.
2. New route `/auth/callback` waits for session, then loads profile:
   - If username missing → show username step.
   - Mark `email_verified_at = now()` (Google-verified).
   - Show phone step → SMS code → `ACTIVE`.
3. If a profile already exists with the same verified email, link Google to it (`google_linked_at`) instead of creating a new one.

## Twilio SMS

- Prompt the user to link the **Twilio** connector (`standard_connectors--connect twilio`) during build.
- Server-side: `sendSms(to, body)` in `src/lib/sms.server.ts` posts to `https://connector-gateway.lovable.dev/twilio/Messages.json` with `LOVABLE_API_KEY` + `TWILIO_API_KEY`, `From` from a new secret `TWILIO_FROM_NUMBER`.
- Never expose Twilio creds to the browser.

## Cloudflare Turnstile

- New workspace/runtime secret pair: `TURNSTILE_SITE_KEY` (public via `VITE_TURNSTILE_SITE_KEY`) and `TURNSTILE_SECRET_KEY` (server).
- Add `<Turnstile />` widget on register + phone-send step. Server functions verify the token against `https://challenges.cloudflare.com/turnstile/v0/siteverify` before sending any code.

## Duplicate / abuse heuristics → SECURITY_REVIEW

At the point of finalising a signup (status flip to ACTIVE), a SQL function `evaluate_signup_risk(uid)` checks:

- another verified profile shares the same normalised email
- another verified profile shares the same phone
- ≥ 3 signups from the same IP in the last 24 h
- ≥ 3 signups from the same device fingerprint in the last 24 h
- ≥ 10 failed code attempts in the last hour
- referral code was already redeemed by this device/IP

If any hit, status → `SECURITY_REVIEW` instead of `ACTIVE`. Users see a "Your account is under review" screen; admins see them in the admin dashboard.

## RLS / gate

- `_authenticated/route.tsx` beforeLoad: after `getUser`, load profile; if status ∈ {`REGISTRATION_INCOMPLETE`,`EMAIL_VERIFICATION_REQUIRED`,`PHONE_VERIFICATION_REQUIRED`} → redirect to `/register?step=…`. If `SECURITY_REVIEW` → `/account/under-review`. If `SUSPENDED`/`BANNED` → `/account/suspended`.
- Bets/wallet server fns already require role `member`; role is only granted on ACTIVE, so no separate check needed.

## Admin dashboard

`src/routes/management/admin.users.tsx` gets:
- Status column + filter (all new statuses).
- Email / phone verified badges.
- Signup IP + device fingerprint.
- Verification attempt log drawer.
- Actions: **Suspend**, **Ban**, **Restore**, **Clear security review → ACTIVE**. No more "Approve" button (dead-code removed).
- New "Security Review Queue" tile on `admin.index.tsx` linking to filtered users view.

Existing `notifyAdminsOfRegistration` is repurposed to only fire when status = `SECURITY_REVIEW`.

## Migrations (single migration, in order)

1. Create enum `account_status`, add columns to `profiles` (with defaults + backfill: existing users with any role → `ACTIVE`, pending-only → `EMAIL_VERIFICATION_REQUIRED`).
2. Create `verification_codes` + grants + RLS (`service_role` only) + indexes.
3. Add `evaluate_signup_risk`, `finalize_active_account`, `has_active_status` functions.
4. Trigger on `profiles.account_status` → auto-insert `member` role when it becomes `ACTIVE`.
5. Update `_authenticated` RLS-supporting policies to require `has_active_status`.

## Files touched

Create: `src/lib/verification.functions.ts`, `src/lib/sms.server.ts`, `src/lib/turnstile.server.ts`, `src/lib/email-templates/verification-code.tsx`, `src/routes/auth.callback.tsx`, `src/routes/account.under-review.tsx`, `src/routes/account.suspended.tsx`, `src/components/auth/OtpInput.tsx`, `src/components/auth/TurnstileWidget.tsx`.

Rewrite: `src/routes/register.tsx`, `src/routes/auth.tsx` (add Google + link to new flow), `src/routes/_authenticated/route.tsx`, `src/routes/management/admin.users.tsx`, `src/lib/notifications.functions.ts` (only notify on SECURITY_REVIEW).

Config: `supabase--configure_social_auth` for Google, `standard_connectors--connect` Twilio, add secrets `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, `TWILIO_FROM_NUMBER`.

## Out of scope

- Migrating already-approved users (they stay `ACTIVE`).
- Password-reset flow rework (unchanged).
- Removing anonymous guest sessions (untouched).
