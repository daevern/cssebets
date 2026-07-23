# Guest/Demo Landing Page

Turn `/` into a full demo experience: users can browse Football, F1, and UFC freely, and are only prompted to sign up when they attempt a bet action. Wallet is added to the bottom nav with a simplified top-up/cash-out info popup.

## 1. Landing page (`src/routes/index.tsx`)

Replace the current single-fixture preview with a tabbed guest shell:

- Keep existing header (logo + Log in + Register) and `CategoryRail`.
- Below the header, add sport tabs: **Football / F1 / UFC** (default: Football).
- Each tab renders the same list components used in the authenticated app but in "guest mode":
  - Football → reuse `FootballCompetitionPage` content (World Cup by default; league switcher optional — start with World Cup only) OR the matches list from `/matches`.
  - F1 → reuse `F1SeasonPage` content (upcoming races grid).
  - UFC → reuse the current UFC fights list from `/ufc/fights`.
- Clicking a fixture/race/fight opens the full detail page in guest mode (see §2).

## 2. Guest-mode detail pages

The detail pages (`matches/$matchId`, `f1/races/$raceId`, `ufc/$fightId`) already accept a `publicMode` / visitor prop pattern (landing already uses `<MatchAnalyticsScreen publicMode />`). Extend the same pattern to F1 and UFC detail screens so they render without a session:

- Show all odds, charts, analytics, live stats — read-only.
- Replace every "Place bet" / stake action button with a `RequireAuthGate` wrapper. Clicking it opens a small modal: "Create a free account to place this bet" with Register + Log in buttons (links to `/register` and `/auth`).
- No changes to server-fns; the analytics/read fns used here are already public or already gracefully return null without a session.

New public routes to host the guest detail views (so they don't require the `_authenticated` gate):
- `src/routes/demo/match.$matchId.tsx`
- `src/routes/demo/race.$raceId.tsx`
- `src/routes/demo/fight.$fightId.tsx`

From the guest tabs, fixture cards link into `/demo/...`. Signed-in users continue to use the existing `_authenticated` routes (nothing changes for them).

## 3. Bottom nav — add Wallet

`LandingBottomNav` in `src/routes/index.tsx` currently has: About, Community, Performance, Help.

Change to 5 items: **Wallet, About, Community, Performance, Help** (or drop one — recommend keeping all 5 in the grid).

Clicking Wallet opens the guest wallet popup (§4), not a route.

## 4. Guest Wallet popup

New component `src/components/wallet/GuestWalletSheet.tsx`. Shown as a bottom sheet / dialog. Contents:

- Title: "Wallet"
- Two buttons: **Top up** and **Cash out**
- **Top up** opens an info panel listing methods + processing time (no form, no auth). Example content:
  - Bank transfer (FPX / DuitNow) — ~5 minutes
  - Touch 'n Go eWallet — instant
  - Manual review deposits — up to 1 hour
- **Cash out** opens an info panel listing conversion + duration:
  - 100 points = 1 MYR (or existing rate — check `platform-settings` if a rate exists)
  - Payout via bank transfer — 1–3 business days
  - Minimum cash-out: 500 points
- Below both panels: "Create an account to top up or cash out" with Register button.

Content is static/informational only — no server calls.

## 5. Auth-gate modal

Small reusable component `src/components/auth/GuestAuthPrompt.tsx`:
- Trigger: any bet button in guest mode.
- Body: "Sign up to place this bet — it's free and takes 10 seconds."
- Buttons: Register (primary, → `/register`) and Log in (→ `/auth`).

## 6. Files touched

- `src/routes/index.tsx` — rewrite as tabbed guest shell + wallet button in bottom nav.
- `src/routes/demo/match.$matchId.tsx` — new, wraps `MatchAnalyticsScreen` in `publicMode`.
- `src/routes/demo/race.$raceId.tsx` — new, wraps F1 race page in guest mode.
- `src/routes/demo/fight.$fightId.tsx` — new, wraps UFC fight page in guest mode.
- `src/features/f1/pages/F1RaceDetailsPage.tsx` — accept `publicMode` prop; gate bet actions.
- `src/routes/_authenticated/ufc.$fightId.tsx` — extract fight detail into a component that accepts `publicMode`, reuse for guest route.
- `src/features/football/pages/FootballMatchDetailsPage.tsx` — accept `publicMode` prop; gate bet actions (analytics already public).
- `src/components/wallet/GuestWalletSheet.tsx` — new.
- `src/components/auth/GuestAuthPrompt.tsx` — new.

## 7. Notes / trade-offs

- Guest bet-gating is UI-only; server-fns already require auth, so security isn't affected — the modal is a UX improvement so users don't get a 401 toast.
- Live/realtime subscriptions on detail pages will fire without a session; where they require auth they'll no-op silently (existing `useHasSession` guard already handles this).
- If you'd rather keep only one code path per detail screen (no `/demo/*` duplicates) I can instead lift the current `_authenticated/matches.$matchId.tsx` etc. out of the auth gate and add per-action gating inside. That's cleaner long-term but a bigger refactor — say the word and I'll do it that way instead.
