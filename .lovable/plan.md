## Change

Raise referral signup bonus from **25 → 50 CSSE**, and backfill everyone already attributed via a referral who hasn't received the bonus yet.

## Steps

1. **Migration — update `handle_new_user`**
   - Change the `csse_credit_tokens(..., 25, ...)` call to `50`.
   - Keep the guard (`v_referral_id IS NOT NULL`) so bonus only fires when a `referrals` row is actually inserted.
   - Keep audit reason `referral_signup_bonus_awarded`.

2. **Data backfill (via insert tool, not migration)**
   - Find every user in `referrals` (referred_user_id) who does NOT already have a `csse_token_transactions` row with `reason = 'referral_signup_bonus'`.
   - For each, call `csse_credit_tokens(referred_user_id, 50, 'earn', 'referral_signup_bonus', referral_id::text, jsonb_build_object('referrer_user_id', referrer_user_id, 'backfill', true))`.
   - Insert `audit_log` entry `referral_signup_bonus_backfilled` per user.
   - This includes `mabb1337` (previously credited 25) — top up by 25 to bring him to 50, OR skip if already credited. **Decision: skip already-credited users** (mabb1337 keeps his 25 — simplest and avoids double-award edge cases). If you want mabb1337 topped up to 50 as well, say so and I'll add a 25-token top-up for him specifically.

## Files touched

- New migration: update `public.handle_new_user` (25 → 50).
- Data-only SQL via insert tool: backfill 50 CSSE for referred users missing the bonus + audit rows.

## Out of scope

- Referrer milestone amounts (unchanged: 50/50/100 at 50/500/1000 wagered).
- UI copy on `/register` (no amount is shown there today).
