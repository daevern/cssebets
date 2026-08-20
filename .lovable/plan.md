# Why the user list is full of nameless accounts

## What I verified in the database

- 338 auth accounts total: **248 are anonymous guest (demo) sessions**, 90 are real registered users.
- Every one of those 248 guests also has a `profiles` row (blank display name) and a `wallets` row — that is why the admin Users table shows ~250 nameless "member" rows with balances of 0 or ~1,000.
- Guest activity is also persisted: 1,081 `wallet_transactions`, 10 `sports_bets`, 160 arcade rounds (mini/treasure/RPS) belong to anonymous users.
- New guests are created continuously — 2 today, 15 yesterday, 25 on 17 Aug — one per fresh visitor/browser, because the landing page calls an anonymous sign-in on load (`src/routes/index.tsx`).
- 155 of the guest accounts have been idle for 7+ days and will never be used again.

So: yes, demo accounts are being stored in the database. The wallet is server-side (`demo_guest_reset` RPC resets it to 1,000 each page load), and every demo bet/round is a real DB row flagged as simulation.

## Why it works that way today

Game results are server-authoritative and provably fair (server seed, RNG, hash commitments), and multi-step games (Blackjack, Towers, Poker, Hi-Lo, Crash) need a round row on the server to continue a hand. A purely client-side demo wallet can't do that, and it would let anyone fake results. The demo money is already excluded from the real bankroll/P/L — the problem is the accumulating rows and the polluted admin view.

## Proposed fix (two parts)

### 1. Stop demo accounts polluting the admin console (immediate, safe)
- Exclude anonymous users from the admin Users list, user counts, staff Users directory, and any "total users" stat — or put them behind a "Show guests" toggle so the 90 real members are what you see by default.
- Same exclusion for pending-approval counts and analytics tiles that count accounts.

### 2. Stop demo data accumulating in the database
- **Reuse one guest session per browser** instead of minting a new anonymous user on every visit (the session already persists in the browser; only sign in anonymously when there is no existing session). This alone stops most of the growth.
- **Nightly cleanup job**: delete anonymous accounts idle for more than 24–48 hours together with their profile, wallet, transactions, demo bets and arcade rounds. Applied now, this clears ~155 stale guests immediately.
- Keep demo rows flagged so they stay out of bankroll, P/L, reconciliation and leaderboards (already the case — I'll re-verify each report path).

## What I would not do
Moving the demo wallet fully client-side, unless you want it: it would break provable fairness and multi-step arcade games for guests, since the server must hold the round state. The retention job plus the admin filter gets you the same outcome — no guest clutter, no unbounded storage — while keeping games server-authoritative.

## Technical notes
- Anonymous detection: `auth.users.is_anonymous` (already used client-side).
- Touched: `src/lib/admin-dashboard.functions.ts` (`listUsersAdmin`), `src/lib/management.functions.ts` (staff user list), `src/routes/index.tsx` (session reuse), plus one migration adding the cleanup function and a scheduled job.
- Verification: re-query counts after cleanup (expect ~90 rows in the admin list) and confirm the house bankroll and P/L figures are unchanged.
