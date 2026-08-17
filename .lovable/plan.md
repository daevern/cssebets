# Demo Wallet: 1,000 Practice Points for Guests

Guests (the anonymous session created before login) get 1,000 demo points to try sports betting and the arcade. The points live only in browser memory for the current visit: they survive navigation inside the app, and reset to 1,000 on every refresh, new tab, or return visit. Nothing touches the real wallet, ledger, bankroll or house accounting.

## Behaviour

- Guest opens the app: balance shows **1,000 pts** with a clear "Demo" marker.
- Placing a sports bet or playing an arcade round deducts the stake from the demo balance; wins credit it back. Game outcomes still come from the real server engine (same RNG and fairness), only the money movement is skipped.
- Demo bets and arcade rounds appear in the guest's own history screens for the session, wiped on refresh.
- Sports bets placed with demo points never settle — they stay as open demo positions.
- Withdrawals / cash-out / top-up requests stay blocked for guests, with a prompt to register.
- Registered users are completely unaffected.

## What changes

### 1. Demo wallet (client, in-memory)
- New `DemoWalletProvider` mounted in the root layout: React state only (no localStorage, no sessionStorage, no DB), seeded at 1,000 for anonymous sessions.
- `useDemoWallet()` exposes balance, `stake(amount)`, `credit(amount)`, plus in-memory demo bet/round history.
- A single `useEffectiveBalance()` hook decides: guest → demo balance, real user → existing `getMyWallet` query. Wired into TopBar, wallet card/page, bet slips, and the arcade HUDs so every balance read-out is consistent.
- Insufficient demo funds shows the same inline error path as a real short balance.

### 2. Server demo mode (no money movement)
- Shared helper `isDemoSession(context)` — true when the Supabase session is anonymous.
- In the sports bet placement and arcade play/settle server functions, when the session is demo:
  - skip wallet debit/credit and all `wallet_transactions` writes,
  - skip the accounting journal entries, liability reservation and bankroll capacity checks,
  - still run the existing outcome engine so the guest sees genuine results,
  - return the outcome to the client, which applies it to the demo balance.
- Multi-step games (Blackjack, Towers, Poker, Hi-Lo, Crash, Video Poker) need their round row to continue a hand, so those rows are written with a new `is_demo` flag.

### 3. Keeping demo out of the books
- Add `is_demo boolean not null default false` to the arcade round tables and `sports_bets`, set from the server helper only.
- Exclude `is_demo` rows from every reporting/settlement path: house P/L, bankroll summary, RTP and reconciliation reports, Arcade Control Centre live stats, admin bet lists, and the sports settlement sweep (so demo bets never settle).
- Demo rows are never counted toward daily round limits or risk exposure.

### 4. Guardrails
- Cash-out, top-up and point requests remain guest-blocked (existing `GuestAuthPrompt` path).
- Demo balance can never be transferred to a real wallet — registration starts a fresh real wallet at its normal balance.
- The demo balance is deliberately not persisted anywhere, so a refresh always restores 1,000.

## Technical notes

- Anonymous detection uses `user.is_anonymous`, already used in `TopBar`, `CashoutSheet` and `dashboard.tsx`.
- Server-side detection reads the JWT claims in `requireSupabaseAuth` context rather than trusting a client flag, so a real user cannot request demo mode.
- Touched areas: `src/routes/__root.tsx`, `src/components/nav/TopBar.tsx`, `src/components/wallet/*`, `src/routes/_authenticated/wallet.tsx`, football/F1/UFC bet placement functions, `src/lib/arcade/*.functions.ts`, plus one migration for the `is_demo` columns and reporting views.
- Verification: play each arcade game and place a sports bet as a guest, confirm balance moves and refresh resets to 1,000; then confirm house bankroll, P/L report and Arcade Control Centre figures are unchanged by that activity.
