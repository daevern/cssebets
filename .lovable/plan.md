
# CSSEBets — Full System Documentation

I'll produce a single comprehensive documentation file capturing everything the app does: user-facing features, admin/staff systems, backend logic, risk math, and data flows. This will be sourced by reading the actual code (server functions, migrations, route files, settlement/odds/risk servers) so the docs match reality — not a generic overview.

## Deliverable

One long-form markdown document: `docs/SYSTEM_OVERVIEW.md` (created new; existing `docs/RUNBOOK.md` and `docs/BACKUP_RECOVERY.md` stay untouched and are cross-referenced).

## Structure

1. **Product Overview**
   - What CSSEBets is, points-based betting model, real vs simulation flows, mobile-first design.

2. **User-Facing Features**
   - Landing page (public market history, live/upcoming fixtures, footer, public info routes: about/community/performance/faq).
   - Auth (email/password + Google, register, invite/referral codes).
   - Dashboard, Matches list, Match detail (markets, analytics, take-a-position modal, sign-in gate for visitors).
   - Bets, My Predictions, Wallet, Payout requests, Free bets, Store (tokens), Referrals, Tournament winner, Notifications, Support, Trust Center, Status, Changelog, Help.
   - Onboarding tour, Welcome modal, engagement tiles, token vault.

3. **Markets & Odds**
   - Full market catalog (1X2, O/U 2.5, BTTS, correct score, HT/FT, exact totals, cards O/U 3.5, corners O/U 9.5 / 10.5, tournament outrights).
   - Odds pipeline: API-Football sync → `apifootball_odds_raw` → median aggregation → margin application (`odds-margin.server.ts`) → `match_market_odds` + `market_odds_snapshots`.
   - House margin math (target overround, per-market redistribution).
   - Snapshots and market movement history (public + authenticated).

4. **Bet Placement & Wallets**
   - Wallet ledger model (`wallets`, `wallet_transactions`).
   - Placement flow, validation (paused, disabled markets, high-odds threshold, max stake, max potential payout, per-user per-match cap).
   - Free bets application and store item redemption.
   - Rate limiting (`rate_limits`) and audit logging.

5. **Settlement Engine**
   - Match lifecycle (scheduled → live → finished / postponed / cancelled).
   - Per-market settlement functions (1X2, O/U, BTTS, correct score, HT/FT, exact totals, cards/corners).
   - Freshness gate fix (kickoff_at anchor) documented from recent migration.
   - Void/refund conditions, payout writes to wallets, `predictions.status` transitions.
   - Catch-up settlement (`settle-catchup.functions.ts`).

6. **Risk Management (Admin)**
   - Emergency controls: pause all bets, disable correct-score, disable high-odds, per-market kill switches, per-user per-match cap.
   - House parameters: margin %, exposure cap fraction of bankroll, max stake, max potential payout, apply-margin-to-real toggle.
   - Correlated exposure alerts (`correlated_exposure_alerts`), match exposure scenarios, stake pools.
   - Bankroll tracking (`platform_bankroll`, `platform_transactions`).
   - Reconciliation runs and drift detection (audit_log actions).
   - High-payout block + rate-limit audit trail visible on risk-settings page.

7. **User Management (Staff)**
   - Roles: `user`, `moderator`, `admin`, `super_admin` (via `user_roles` + `has_role`).
   - Staff portal (`/management/*`): support queue, users, chat, admin dashboards, super-admin, settings, forced password change flow, access-denied handling.
   - Point requests, wallet adjustment requests, payout approvals, referral overview, referred users, staff audit logs.

8. **Support & Communications**
   - Support conversations/messages, unread counts, staff audit logs.
   - Email pipeline: unsubscribe tokens, suppressed emails, send state/log, queue processing route.
   - Notifications system, WinDetector + WinTicketModal.

9. **Referrals, Engagement, Tokens**
   - Referral code generation, referral tracking, rewards.
   - CSSE tokens (`csse_token_wallets`, `csse_token_transactions`, `csse_store_items`, `csse_free_bets`).
   - Engagement tiles + tour config.

10. **Simulation Mode**
    - World Cup simulator (`sim-worldcup.server.ts`, `simulator.ts`, `simulation.functions.ts`), isolation from real bankroll/risk.

11. **Operations & Health**
    - Health check runs, incidents, operational alerts, admin operations page.
    - Sync jobs (fixtures, prematch, live, fulltime, lineups) via `/api/public/hooks/*` and pg_cron.
    - Slow queries, DB linter, backup/recovery reference.

12. **Backend Architecture**
    - TanStack Start, `createServerFn` for app logic, server routes only for public hooks/webhooks.
    - Supabase clients: browser, server publishable, `requireSupabaseAuth`, `supabaseAdmin` (privileged-only).
    - Auth gating: `_authenticated` layout (ssr:false), management gate, bearer attacher in `src/start.ts`.
    - RLS + GRANT model; `has_role` security-definer pattern.

13. **Database Schema Reference**
    - Table-by-table summary (all ~50 public tables): purpose, key columns, RLS shape, links.

14. **Key Calculations Cheat Sheet**
    - Overround / margin application formulas.
    - Potential payout = stake × decimal_odds; cap = min(max_potential_payout, bankroll × exposure_cap_pct).
    - Free-bet redemption math.
    - Referral reward computation.
    - Settlement decision tables per market.

15. **Runtime Constraints & Gotchas**
    - Cloudflare Worker runtime limits, Node-only packages avoided.
    - Public route loaders can't call `requireSupabaseAuth`.
    - `supabaseAdmin` only inside handlers of `.functions.ts`.

16. **Cross-references** to `docs/RUNBOOK.md`, `docs/BACKUP_RECOVERY.md`, and `.lovable/plan.md`.

## Method

- Read source in parallel batches: server files in `src/lib/*.server.ts` and `*.functions.ts`, all `src/routes/management/admin.*`, migrations under `supabase/migrations/`, and key components.
- Extract exact formulas from `odds-margin.server.ts`, `settlement.server.ts`, `risk.functions.ts`, `bankroll.functions.ts`.
- Query DB schema via `supabase--read_query` for column-level accuracy where needed.

## Out of Scope

- No code changes to app behavior.
- No secret values, no Supabase dashboard URLs.
- Not editing existing docs — only adding `docs/SYSTEM_OVERVIEW.md`.

Estimated length: ~1,500–2,500 lines of markdown. If you'd prefer it split into multiple files under `docs/` (e.g. `docs/architecture.md`, `docs/risk.md`, `docs/settlement.md`), say so before I start.
