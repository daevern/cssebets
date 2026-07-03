## Problems observed

1. **TopBar covers the logo.** At 393px the right cluster (wallet chip + CSSE token chip + Bell + Profile) is wide enough that it visually overlaps the CSSEBets brand on the left. `min-w-0` on the brand link lets it shrink to zero, so the logo/wordmark ends up hidden or clipped behind the right cluster.

2. **Referral link looks the same for every user.** In the DB each profile has a unique `referral_code` (verified: `Daev` → `CZX6AVR`, `daev` → `53H3KN5`, `Daevern` → `9YPK5F6`, `Halim` → `NHWXXHY`, etc.). So the data is correct. The UI issue is a **cache leak between accounts on the same browser**: on `SIGNED_OUT` we don't clear `queryClient`, so the previous user's `["referral-overview"]` and `["engagement-summary"]` cache entries stay. When the next user signs in, `invalidateQueries()` fires and eventually refetches — but until the refetch completes the UI (and any share/copy action) shows the prior user's code. Query keys aren't scoped by `userId` either, so mid-transition reads can also hit stale data.

3. **Token counters don't agree.** DB shows only one wallet with balance/lifetime = 7 (Halim, from two `bet_placement` earn rows). No `referrals.total_tokens_awarded > 0` rows anywhere. So:
   - "Earned 7" that Daev sees is almost certainly the same cross-account cache leak as #2 — Daev is being shown Halim's engagement summary until the query refetches.
   - Separately, referral milestone completions are not currently crediting `csse_token_wallets` (no rows with `total_tokens_awarded > 0`, and no wallet grew from a referral), so the referrals page's "Tokens Earned" total and the wallet balance will never agree even after cache is fixed.

## Fix

### A) TopBar — stop the logo being covered (`src/components/nav/TopBar.tsx`)

- Make the brand link `shrink-0` (not `min-w-0`) so the CSSEBets mark is never squeezed to zero, and hide the wordmark on mobile so only the compact logo shows.
- Tighten the right cluster on mobile: drop the `PTS` suffix (already `hidden sm:inline`), keep the CSSE token chip icon-only + number (hide the "CSSE" tri-letters below `sm:`), and reduce the mobile height of Bell/Profile to `h-8 w-8` with `gap-1` between them.
- Keep header `overflow-hidden` + `min-w-0` on the inner row (already in place) so the page never side-scrolls.

Presentation only — no link, route, or data changes.

### B) Referral / engagement — kill cache leak between accounts

Two small, targeted changes:

1. **Scope user-specific query keys by user id** in `src/components/engagement/TokenVault.tsx`, `src/components/engagement/ReferralPanel.tsx`, `src/components/engagement/EngagementTiles.tsx`, `src/routes/_authenticated/referrals.tsx`:
   - Change `["referral-overview"]` → `["referral-overview", userId]`.
   - Change `["engagement-summary"]` → `["engagement-summary", userId]`.
   - Change `["my-free-bets"]` and `["my-token-ledger"]` similarly.
   - Read `userId` from the existing `useAuth` hook.

2. **Clear cache on sign-out** in `src/routes/__root.tsx`:
   - In the `AuthSync` `onAuthStateChange` handler, on `SIGNED_OUT` call `queryClient.clear()` (in addition to the existing `router.invalidate()`), so no prior user's data can ever be shown to the next user.

After this, each account's referral panel/copy button will always render its own unique `referral_code` from `profiles`.

### C) Token counters — make "earned" agree with wallet

Once B is in, the "Daev sees earned=7 / balance=0" symptom disappears (it was Halim's data). What remains is a real logic gap: **referral milestone rewards don't credit the token wallet**. Fix by wiring the reward path so any change to `referrals.total_tokens_awarded` also creates a `csse_token_transactions` `earn` row and updates `csse_token_wallets` for the referrer:

- Add a Postgres trigger on `referrals` (AFTER UPDATE) that, when `total_tokens_awarded` increases, calls the existing token-grant path (same code path as `admin_grant_tokens` uses under the hood) for the delta, tagged `kind='earn'`, `source='referral_milestone'`, `source_ref=referral_id`.
- This makes wallet balance, lifetime_earned, and the referrals page's "Tokens Earned" self-consistent by construction.
- No backfill for existing rows — currently all `total_tokens_awarded` are 0, so nothing to reconcile.

## Not in scope

- Payment gateway integration (separate track, already discussed).
- Changing the referral milestone thresholds (Stage 1/2/3) or the earn rate — the rules stated in the referrals page are preserved.

## Acceptance

- At 393px, the CSSEBets logo is fully visible in the TopBar; right cluster fits without overlap; no horizontal page scroll.
- Signing out of account A and into account B on the same browser immediately shows B's own referral code (never A's), and B's engagement/token numbers.
- Any future referral milestone that awards CSSE tokens shows up in the wallet balance and the token ledger for the referrer, matching the "Tokens Earned" total on the referrals page.

## Technical notes

- Files touched: `src/components/nav/TopBar.tsx`, `src/routes/__root.tsx`, `src/components/engagement/{TokenVault,ReferralPanel,EngagementTiles}.tsx`, `src/routes/_authenticated/referrals.tsx`, plus one Supabase migration for the referrals → token-wallet trigger.
- No changes to `getMyReferralOverview` / `getMyEngagementSummary` signatures — they already scope by `context.userId`.
- `queryClient.clear()` on `SIGNED_OUT` is safe here because the auth gate redirects to `/auth` immediately after, so there is no protected UI left that could refetch against a cleared session.
