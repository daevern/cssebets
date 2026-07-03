# Why you can't see them

The routes `/referrals`, `/store`, and `/free-bets/place` were built and registered, but nothing in the user-facing UI links to them and no component reads your CSSE token balance on the Dashboard/Wallet. So the pages exist at those URLs, but there is no entry point — that is the whole reason it looks like nothing was implemented.

# Fix plan (frontend only, presentation)

## 1. Add a Wallet quick-actions strip
On `src/routes/_authenticated/wallet.tsx`, add a small 3-tile row directly under the points balance:
- **CSSE Tokens** — shows live token balance from `getMyEngagementSummary`, links to `/store`.
- **Referrals** — shows referral code + invite count from `getMyReferralSummary`, links to `/referrals`.
- **Free Bets** — shows count of unused free bets, links to `/store` (Redeem tab) or `/free-bets/place` when one is active.

Uses the existing `StencilPanel` aesthetic, one server-fn query per tile via `useQuery`.

## 2. Add a Dashboard "Engagement" panel
On `src/routes/_authenticated/dashboard.tsx`, insert a compact panel below the "Your Position" slider showing:
- Token balance + level badge
- Referral code with a Copy button and share link (`?ref=CODE`)
- CTA button "Open Store"

This makes tokens/referrals visible from the home screen without needing to hunt.

## 3. Bottom-nav access
`BottomNav` has 5 slots that are already full (Home, Markets, Picks, Payout, Support). Rather than dropping one, add a small **"More"** row on the Dashboard header (or a token-coin icon next to the profile avatar in the top-right of `PageShell`) that opens a sheet with links to Referrals, Store, Free Bets, Notifications, Trust Center. This keeps mobile-first density intact.

## 4. Wire free-bet placement into the Markets flow
On the match detail page (`matches.$matchId.tsx`), when the user has an unused free bet, show a persistent "Use free bet" chip inside `MarketTabs`' `StakeSlip`. Selecting it flips the slip into free-bet mode (stake locked to the free bet's face value, "House stakes — you keep profit" label). If no market is selected, the chip deep-links to `/free-bets/place`.

## 5. Register onboarding hint (one-time)
After first login, show a single toast: "You earned your referral code — share it to earn CSSE tokens." Dismiss stored in `localStorage`. No modal, no interruption.

## Technical section

Files to touch:
- `src/routes/_authenticated/wallet.tsx` — add 3-tile quick actions (uses `getMyEngagementSummary`, `getMyReferralSummary`, `listMyFreeBets`).
- `src/routes/_authenticated/dashboard.tsx` — add `EngagementPanel` component below `BenchSlider`.
- `src/components/engagement/EngagementPanel.tsx` — new; token balance + referral copy card.
- `src/components/engagement/QuickActionTile.tsx` — new; shared tile primitive.
- `src/components/ui/page-shell.tsx` (or the header inside it) — add "More" trigger opening a `Sheet` with links.
- `src/components/nav/MoreSheet.tsx` — new; grouped links (Referrals, Store, Free Bets, Notifications, Trust Center, Changelog, Status).
- `src/components/markets/MarketTabs.tsx` — add free-bet chip to `StakeSlip` when `listMyFreeBets` returns unused items.
- `src/routes/__root.tsx` — one-time onboarding toast helper.

Server functions used (already exist): `getMyEngagementSummary`, `getMyReferralSummary`, `listMyFreeBets`, `getStoreItems`.

No backend or RLS changes needed — the routes and RPCs are already live; this is purely making them discoverable.
