## Problem

Referral attribution is 100% client-side and silently drops:

- `/?ref=CODE` writes to `localStorage` on the root route.
- `/register` reads `localStorage` and puts the code in signup metadata.
- DB trigger `handle_new_user` creates the `referrals` row only if that metadata field is present.

If the invitee opens the link in one browser (WhatsApp in-app, incognito, etc.) and signs up in another, or if they land on `/register?ref=...` directly, the code is lost. That is why `mabb1337` has no `referrals` row and no `referred_by_code` even though he used Miata's link `9W928VQ`. Referred users also currently get **0 CSSE** — only the referrer earns milestone tokens.

## Fix

### 1. Manual referral code field on `/register`

- Add an optional "Referral code" input to `src/routes/register.tsx` in both the email and phone forms.
- Prefill it from `getStoredReferralCode()` on mount (so URL-captured codes still auto-fill and are visible).
- On submit, uppercase + validate against `^[A-Z0-9]{4,12}$`; if valid, pass it in `options.data.referral_code` (overriding the stored one when the user typed something different).
- Show a subtle hint "Have a friend's code? Enter it here — you both get rewarded."
- No DB change needed — `handle_new_user` already reads `raw_user_meta_data->>'referral_code'`.

### 2. Also capture `?ref=` on `/register`

- Call `captureReferralFromUrl()` inside `RegisterPage`'s mount effect (mirroring `__root.tsx`).
- Handles the case where a share link points directly at `/register?ref=CODE` or where the root effect hasn't populated storage before the user navigates.

### 3. Retroactively attribute `mabb1337 → Miata (9W928VQ)`

Via `supabase--insert`:

- Set `profiles.referred_by_code = '9W928VQ'` for `b08536f2-eff4-416c-affe-83fd5ee17d43`.
- Insert into `referrals(referrer_user_id, referred_user_id, referral_code)` using Miata's user id (looked up from `profiles.referral_code = '9W928VQ'`).
- Call `award_referral_milestones('b08536f2-…')` so Miata gets any already-earned stages (he has 0 wagered right now, so no immediate credit, but future settled wagers will progress stages).

### 4. Joiner signup bonus (CSSE tokens for referred user)

You picked this but didn't specify an amount. **Default proposal: 25 CSSE**, credited once when the `referrals` row is created (i.e. inside `handle_new_user`, right after the successful `INSERT INTO public.referrals`).

- New DB migration adds a `PERFORM public.csse_credit_tokens(NEW.id, 25, 'earn', 'referral_signup_bonus', <referral_id>::text, jsonb_build_object('referrer_user_id', v_referrer))` inside `handle_new_user`, guarded so it only fires when a `referrals` row was actually inserted (not on `ON CONFLICT DO NOTHING`).
- Also backfill 25 CSSE to `mabb1337` as part of the retro attribution insert above, so he's not disadvantaged.
- Audit log entry `referral_signup_bonus_awarded`.

If you want a different amount (e.g. 50 or 10), say so and I'll use that number instead of 25.

## Files touched

- `src/routes/register.tsx` — input field, capture-on-mount, validation, pass through metadata.
- Migration: update `public.handle_new_user` to also credit the joiner bonus.
- Data fix (via insert tool, not migration): retro-attribute mabb1337, backfill his bonus.

## Out of scope

- No change to referrer milestone amounts (50/50/100 at 50/500/1000 wagered).
- No change to the admin referred-users / referrals dashboards — they'll pick up the new row automatically.
- No cookie-based cross-device attribution (would need a server-side click endpoint; happy to plan separately if you want that later).
