# CSSEBets — System Overview

> A complete reference to what CSSEBets is, how every feature works, the
> math behind odds and risk, and how the admin/staff systems operate.
>
> Companion documents: [`RUNBOOK.md`](./RUNBOOK.md) (day-to-day operational
> procedures), [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) (disaster
> recovery).

---

## 1. Product Overview

CSSEBets is a **points-based prediction market** for football (soccer). It
looks and feels like a sportsbook, but every stake is denominated in
**points** rather than fiat. Points are issued to approved users by staff
after off-platform value transfer (proof-of-payment uploaded to a "point
request"), and users can request **payouts** back out through the same
staff-mediated flow.

Two independent worlds run inside one codebase:

| World | Purpose | Bankroll | Wallets | Flag |
|---|---|---|---|---|
| **Real** | Actual user play against the house | `platform_bankroll` id=1 (`kind='live'`) | `wallets` (`is_simulation=false`) | `is_simulation=false` on every row |
| **Simulation** | World Cup / tournament sandbox for testing and demo | `platform_bankroll` id=2 (`kind='simulation'`) | Same tables, `is_simulation=true` | `is_simulation=true` |

A DB partial-unique index (`platform_bankroll_one_active_live_idx`)
guarantees exactly one active live bankroll row. Risk math NEVER sums
across the two — the simulation must never influence live decisions.

**Design tenets:**
- Mobile-first. Most users are on phones (see analytics — 229 mobile vs
  108 desktop over the last 7 days). Layouts, tap targets, bottom nav,
  and the management portal are all designed for narrow viewports first.
- House transparency. The trust center, market movement history, and
  platform pulse expose real numbers (bankroll coverage, settlement
  latency) to end users.
- Staff-mediated economy. No self-serve deposits or withdrawals — every
  point issuance and payout is reviewed and approved by staff, so KYC
  and payment risk live outside the app.

---

## 2. Tech Stack & Runtime

- **Framework:** TanStack Start v1 (React 19, Vite 7) targeting Cloudflare
  Workers via `workerd` with `nodejs_compat`.
- **Backend:** Lovable Cloud (Supabase) — Postgres + Auth + Storage +
  Realtime. All app logic is written as `createServerFn` from
  `@tanstack/react-start`; **no Supabase Edge Functions** are used for
  app-internal logic. Server routes under `src/routes/api/public/*` are
  used only for webhooks/cron endpoints (API-Football sync hooks, health
  check, reconciliation trigger).
- **Auth:** Supabase Auth with email/password + Google OAuth (via the
  Lovable broker `lovable.auth.signInWithOAuth`).
- **Routing:** File-based routes under `src/routes/`. Protected routes
  live under `_authenticated/` (managed layout, `ssr:false`, redirects to
  `/auth`). The staff portal lives under `/management/*` with its own gate
  (`src/routes/management/route.tsx`).
- **Styling:** Tailwind CSS v4, semantic tokens in `src/styles.css`, custom
  brand icons in `src/components/brand/`.
- **Data fetching:** TanStack Query. Loaders call `ensureQueryData`;
  components read via `useSuspenseQuery` or `useQuery`.
- **Bearer attach:** `src/start.ts` registers a client-side
  `functionMiddleware` that attaches the Supabase bearer token to every
  authenticated server-fn call.

**Supabase clients** — pick by call site:

| Import | Where | RLS |
|---|---|---|
| `@/integrations/supabase/client` (`supabase`) | Browser only | As signed-in user |
| Server publishable client (created in-handler) | Server fns/routes serving public data | As `anon` |
| `requireSupabaseAuth` middleware | Server fns acting as the signed-in user | As that user |
| `@/integrations/supabase/client.server` (`supabaseAdmin`) | Privileged server-only work; **dynamic-imported inside handlers** | Bypassed |

---

## 3. User-Facing Features

### 3.1 Public (unauthenticated) surfaces

- `/` — Landing page. Hero, live+upcoming fixtures, market-movement
  analytics for the featured match, trust sections, footer.
  - Market history is fetched via `getMarketHistoryPublic`
    (`src/lib/market-history.functions.ts`) so visitors see real
    movement without auth.
  - Fixtures include live matches (red pulsing ring) and hide any
    `TBD vs TBD` placeholders.
- `/auth` — Sign in / sign up (email+password, Google).
- `/register` — Referral-code aware registration path.
- `/about`, `/community`, `/performance`, `/faq`, `/brand` — Info
  pages. Fully public, no auth required.
- `/matches/:matchId` — Public match detail with markets and the
  "Take a position" flow. Placement itself gates behind a sign-in
  modal for anonymous visitors.

### 3.2 Authenticated app (`_authenticated/`)

| Route | Purpose |
|---|---|
| `/dashboard` | Home for signed-in users: next fixture, engagement tiles, wallet snapshot, referral panel. |
| `/matches` | List of upcoming/live fixtures grouped by day. |
| `/matches/:matchId` | Full market grid (`MarketTabs.tsx`), analytics card, free-bet redemption, prediction placement. |
| `/my-predictions` | Every ticket the user has placed with status (pending / won / lost / void) and payout. |
| `/bets` | Alias for the tickets ledger with filters. |
| `/wallet` | Balance, transactions, point-request submission (with proof upload to `point-request-proofs` storage bucket). |
| `/payout` | Payout request lifecycle (pending → approved → proof_uploaded → paid). |
| `/free-bets/place` | Redeem free-bet tokens issued by staff or the store. |
| `/store` | Redeem CSSE tokens for store items (`csse_store_items`). |
| `/referrals` | User's referral code, share link, referral history and rewards. |
| `/tournament-winner` | Outright market for the current tournament (World Cup). |
| `/notifications` | In-app notification feed (unread pill count in top bar). |
| `/support` | User-facing support conversations. |
| `/trust-center` | Bankroll coverage, payout SLAs, incidents. |
| `/status` | Live health of upstream services. |
| `/changelog` | Recent releases from `src/content/changelog.ts`. |
| `/help` | Tour / onboarding help entrypoint. |
| `/settings` | Profile, avatar, email prefs, sign-out. |

Global UI pieces: `BottomNav`, `TopBar` (badge counts), `WinDetector`
(polls for newly settled winning tickets and pops `WinTicketModal`),
`TourProvider` (walkthroughs configured in `tours.config.ts`),
`WelcomeModal` (first-run).

---

## 4. Markets & Odds

### 4.1 Market catalog

Defined in `src/lib/markets-catalog.ts`. Every market key is typed so
historical tickets keep valid labels even after a market is retired.

**Active markets** (what users actually see):

- Match result family: `1x2`, `to_qualify`, `double_chance`,
  `draw_no_bet`, `half_time_full_time`.
- Goals: `over_under_1_5`, `over_under_2_5`, `over_under_3_5`, `btts`,
  `correct_score`, `goals_odd_even`, `clean_sheet_home`, `clean_sheet_away`.
- Cards: `cards_over_under_3_5`, `cards_over_under_4_5`,
  `red_card_match`.
- Corners: `corners_over_under_9_5`, `corners_over_under_10_5`,
  `home_corners_over_under_4_5`, `away_corners_over_under_4_5`.

Retired but still typed (for historical settlement): O/U 0.5/4.5/5.5/6.5,
cards O/U 2.5/5.5, home/away cards 1.5, first_card, corners O/U 8.5/11.5,
first_corner.

Correct-score options include all combinations up to 4-2 plus `OTHER`.
Half-time/Full-time combines all 9 (`HOME_HOME` through `AWAY_AWAY`).
Exact-total-goals is `GOALS_0` through `GOALS_5_PLUS`.

### 4.2 Odds pipeline

```
API-Football  ──/fixtures──▶  apifootball_odds_raw     (audit)
              ──/odds─────▶
                              ▼
                       median across bookmakers
                              ▼
                     odds-margin.server.ts  (house margin applied)
                              ▼
                match_market_odds  +  matches.reference_odds
                              ▼
                     market_odds_snapshots  (movement history)
```

The sync worker is `src/lib/apifootball-sync.server.ts`; parsing lives
in `apifootball-mapping.ts`. Hooks in `src/routes/api/public/hooks/`
are called by pg_cron:

- `apifootball-sync.ts` — fixture list + odds refresh (pre-match).
- `apifootball-prematch.ts` — deeper pre-match sync (h2h, injuries, lineups).
- `apifootball-live.ts` — live stats + in-play score.
- `apifootball-fulltime.ts` — final scores + trigger settlement.
- `apifootball-lineups.ts` — starting XI.
- `sync-fixtures.ts` — fixture master list.
- `health-check.ts` — writes `health_check_runs`.
- `reconciliation.ts` — nightly wallet ↔ ledger drift check.

Quota per match: 1 request to `/fixtures` (once, to resolve the API
fixture id) then 1 to `/odds` per refresh. `apifootball_quota` table
tracks daily usage.

### 4.3 House pricing model

The CSSEBets house does **not** copy bookmaker odds. Steps
(from `odds-margin.server.ts`):

1. For each selection `i`: `p_raw_i = 1 / api_odds_i`.
2. Strip bookmaker overround: `p_fair_i = p_raw_i / Σ p_raw`.
3. Apply house margin: `p_house_i = p_fair_i × (1 + margin_pct/100)`,
   capped at `0.999`.
4. Convert back: `display_odds = max(1.01, round(1 / p_house_i, 2))`.

Default margin is **25 %** (stored in `platform_settings.margin_pct`).
`apply_margin_to_real` can be toggled off, in which case raw fair
probabilities are used — zero house edge.

Same algorithm applies to N-way outrights (`applyOutrightMargin`).

### 4.4 Market movement history

Every odds refresh writes a row to `market_odds_snapshots` /
`match_odds_snapshots`. `MarketAnalyticsCard` (with `publicMode`) renders
a delta line so users can see how the house re-priced the match. Public
mode disables realtime subscriptions and reads the same data via the
anon-safe `getMarketHistoryPublic`.

---

## 5. Bet Placement & Wallets

### 5.1 Wallet model

- `wallets`: one row per `(user_id, is_simulation)`, holds current
  `balance` (points, integer-ish DECIMAL).
- `wallet_transactions`: append-only ledger with
  `type` ∈ {`credit`, `debit`}, `reference_type`
  ∈ {`bet_placement`, `bet_settlement`, `bet_void`, `point_request`,
  `payout`, `free_bet_grant`, `store_purchase`, `token_conversion`,
  `admin_adjustment`}, plus foreign keys to the referenced row.

Every write to `wallets.balance` is paired with a `wallet_transactions`
row inside a Postgres RPC — the ledger is the source of truth and
`reconciliation.functions.ts` verifies drift.

### 5.2 Placement flow (`submitPrediction`)

Defined in `src/lib/predictions.functions.ts`. Order of checks:

1. **Role gate** — user must have `member` or `admin` role in
   `user_roles`. New sign-ups start without a role and must be approved
   by staff.
2. **Rate limit** — `enforceRateLimit(user:${uid}, 'bet_placement')` via
   `rate_limits`. Exceeding it writes an `audit_log`
   `rate_limit_triggered` entry visible on the risk-settings page.
3. **Server-side odds validation** — the client-supplied `referenceOdds`
   is compared to `matches.reference_odds` (or `tournament_outrights`
   for outrights). Drift > 5 % → "Odds have changed, refresh".
4. **Snapshot binding** — the latest `match_odds_snapshots.id` is stored
   on the prediction so the exact price shown to the user is auditable.
5. **Risk emergency gates** (from `platform_settings`):
   - `bets_paused` → reject all.
   - `disabled_markets[]` contains the market key → reject.
   - `correct_score_disabled` → reject correct_score.
   - `high_odds_disabled` and `odds ≥ high_odds_threshold` → reject and
     log `high_payout_attempt_blocked`.
   - Stake > `max_stake_per_bet` → reject.
   - `stake × odds` > `max_potential_payout` → reject.
   - Bets on this match by this user ≥ `max_bets_per_user_per_match`
     (0 = unlimited) → reject.
6. **Wallet debit** — RPC deducts `virtual_stake` from wallet, writes
   `wallet_transactions` (`type=debit`, `reference_type=bet_placement`),
   updates `matches.<home|draw|away>_liability` and
   `matches.worst_case_exposure`, and writes to `match_stake_pools`.

### 5.3 Free bets and store

- `csse_free_bets` — a granted free bet has `remaining_amount`,
  `min_odds`, `expiry_at`, `source` (`referral` | `store` | `staff`).
  When redeemed, the debit is still recorded but wallet balance is
  untouched; a `free_bet_grant` reference points back to the granting
  transaction. Winnings from a free bet return stake+profit like any
  other bet.
- `csse_store_items` — staff-configured redeemable items priced in
  `csse_tokens`. `csse_token_wallets` + `csse_token_transactions` track
  token balances (earned via engagement events, referrals, promos).

### 5.4 Point requests (deposit-in)

Three-step flow to keep proof upload atomic:

1. `createDraftPointRequest` → row in `point_requests`, `status='pending_upload'`.
2. Client uploads proof PNG/JPG to storage bucket `point-request-proofs`
   at path `{userId}/{requestId}`.
3. `attachPointRequestProof` links the file, moves to `status='pending'`.
4. Staff (admin) approves/rejects on `/management/admin/points`. On
   approve, an RPC credits the wallet, writes a `credit` transaction
   with `reference_type='point_request'`, and updates the request row.

### 5.5 Payouts (deposit-out)

`payout_requests` lifecycle:

```
pending  ──admin approve──▶  approved  ──staff pays off-platform──▶
proof_uploaded  ──user confirms receipt──▶  paid
```

- Only one active payout per user at a time.
- Requested amount is validated against wallet balance at request time
  and again at approval time.
- On approve, wallet is debited immediately (a `debit` transaction
  with `reference_type='payout'`) — the user's balance can't be
  double-spent while the payout is in flight.
- If rejected, the debit is reversed.

---

## 6. Settlement Engine

### 6.1 Match lifecycle

`matches.status` ∈ {`scheduled`, `live`, `finished`, `postponed`,
`cancelled`}. Score fields separate regulation from aggregate:

- `home_score` / `away_score` — regulation (90 minutes).
- `ft_home_score` / `ft_away_score` — after ET/pens.
- `home_score_ht` / `away_score_ht` — half-time.

### 6.2 Grading rules

- **90-minute markets** (1x2, O/U, BTTS, correct_score, exact_total,
  goals_odd_even, HT/FT, clean sheet, cards, corners) grade on
  **regulation** (`home_score`/`away_score`).
- **`to_qualify`** grades on who advances after ET + penalties
  (`qualifier` argument to the settler).
- **Cards/corners** grade on `match_stats` totals; if stats missing → VOID.

`settlePredictionsForMatch(matchId, homeScore, awayScore, ht?, awayHt?, qualifier?)`
(in `settlement.server.ts`) calls the atomic RPC
`settle_match_all_markets_atomic`. A defensive guard refuses to settle
when the caller passes the ET aggregate for a match that went to ET —
90-minute markets MUST use regulation.

### 6.3 Cards & corners freshness gate

Fixed on 2026-07-06 (migration
`20260706034406_...`). Previous logic used `matches.updated_at` as the
freshness anchor, which any admin/sync touch could invalidate hours
after kickoff. New anchor:

```
v_freshness_anchor := COALESCE(matches.kickoff_at, matches.updated_at, now())
```

Stats are "fresh" if `match_stats.fetched_at >= kickoff_at` (or the
matches row itself has `home_corners` populated). This makes cards/
corners settle reliably after admin edits to the match row.

### 6.4 Void conditions

- Match `status='cancelled'` or `status='postponed'` → `void_match_atomic`
  refunds every stake, wallet transactions of type `credit` with
  `reference_type='bet_void'`.
- Individual prediction voided when settling that market is impossible
  (e.g. no card stats) — stake refunded, others in the same match still
  settle.

### 6.5 Catch-up

`settle-catchup.functions.ts` finds `finished` matches with pending
predictions and re-runs settlement. Runs on-demand from the admin
settlements page and can be scheduled via the reconciliation hook.

---

## 7. Risk Management (Admin)

### 7.1 Platform settings

Row `id=1` in `platform_settings`:

| Field | Default | Purpose |
|---|---|---|
| `margin_pct` | 25 | House overround target |
| `apply_margin_to_real` | true | Off = raw fair odds |
| `exposure_cap_pct` | 0.6 | `worst_case_liability ≤ bankroll × this` |
| `max_stake_per_bet` | 5000 | Hard cap per ticket (0 = off) |
| `max_potential_payout` | 50000 | Hard cap on stake × odds |
| `bets_paused` | false | Global kill switch |
| `correct_score_disabled` | false | Retail-abuse market kill |
| `high_odds_disabled` | false | Reject longshots |
| `high_odds_threshold` | 50 | Threshold for above |
| `disabled_markets` | `{}` | Per-market kill switch (text[]) |
| `max_bets_per_user_per_match` | 0 | 0 = unlimited |

All controls live on **`/management/admin/risk-settings`**
(`admin.risk-settings.tsx`), which also surfaces the last 24 h of
`rate_limit_triggered`, `high_payout_attempt_blocked`, and
`reconciliation.drift_detected` audit events.

### 7.2 Risk dashboard (`getRiskDashboard`)

For every pending real prediction, the server computes per-match
outcome buckets:

```
liabilityIfWins  = Σ potential_return of tickets that would win in this scenario
netIfWins        = liabilityIfWins − totalStake_of_match
worstCase        = max(liabilityIfWins) across scenarios
```

Then aggregates across matches to a platform total, compared against
**canonical bankroll** — `platform_bankroll` id=1, `kind='live'`,
`is_active=true`. If that row is missing or nulled, the dashboard
refuses to compute and raises a critical alert.

Alert types:
- `outcome_dominance` — one outcome carries > `userExposurePct` of match
  liability.
- `user_exposure` — a single user > threshold of a match's stake.
- `bankroll_breach` — worst-case > bankroll × `exposureCapPct`.
- `total_liability` — aggregate liability > safety ratio.

Recommendations per match: `accept`, `limit_stake`, `reduce_odds`,
`close_market`.

### 7.3 Bankroll

`platform_bankroll` singleton per `kind`:

| Column | Meaning |
|---|---|
| `balance` | Current chips available to pay winners |
| `total_stakes_collected` | Lifetime sum of debits from wallets on placement |
| `total_payouts_paid` | Lifetime sum of credits back to wallets on win |
| `house_user_id` | Wallet that receives/pays for the house |

`platform_transactions` mirrors every bankroll change. Admin operators
adjust via `/management/admin/bankroll`.

### 7.4 Correlated exposure

`correlated_exposure_alerts` fires when multiple tickets across markets
share a common outcome dependency (e.g. all rely on "home team wins").
Match scenarios are enumerated in `match_exposure_scenarios`.

`match_stake_pools` aggregates stake and payout per match×market for
quick liability queries.

### 7.5 Reconciliation

`reconciliation.functions.ts` calls RPC `run_reconciliation_check`
which recomputes wallet balances from `wallet_transactions` and
compares to `wallets.balance`. Drift → `audit_log`
`reconciliation.drift_detected` and an `operational_alerts` row.
Runs manually from `/management/admin/reconciliation` or via the
`/api/public/hooks/reconciliation.ts` cron endpoint.

---

## 8. User Management (Staff)

### 8.1 Roles

Stored in `user_roles` (separate table — never on `profiles`).
Enum `app_role`: `user`, `member`, `moderator`, `admin`,
`super_admin`, `viewer`.

Access is checked via `has_role(_user_id, _role)` (security-definer,
avoids RLS recursion). Codepaths use `requireTier(...)` helpers.

- `user` — signed up, no play.
- `member` — approved user; can place bets.
- `moderator` — support & chat only.
- `viewer` — read-only admin dashboards.
- `admin` — full admin console (users, risk, payouts, bankroll, etc.).
- `super_admin` — plus staff management, secrets, destructive ops.

### 8.2 Staff portal (`/management/*`)

Layout: `src/routes/management/route.tsx`. `ssr:false`, gated by
`supabase.auth.getUser()`. On sign-in, staff without a role see a
"No clearance on record" screen with sign-out. `admin.*` requires
admin tier; `super-admin.*` requires super_admin.

Top nav (with unread badges):
- **Support** — pending user approvals + point-request queue count.
- **Users** — profile search, role assignments, ban/suspend.
- **Chat** — active support conversations, unread messages.
- **Admin** (admin+) — dashboards below.
- **Super** (super only) — staff management, secrets, dangerous ops.
- **Settings** — staff profile, forced password change flow.

Force-password-change: if `staff_users.force_password_change=true`, the
layout redirects every route to `/management/change-password` until
resolved.

### 8.3 Admin sub-pages

Every file `src/routes/management/admin.*.tsx` corresponds to a page:

| Page | Purpose |
|---|---|
| `admin.index` | Dashboard summary (stakes, liability, active users, bankroll). |
| `admin.users` | User search, role edit, wallet snapshot, ban. |
| `admin.staff` | Staff roster (super_admin). |
| `admin.points` | Approve/reject point requests. |
| `admin.wallet-adjustments` | Manual wallet credits/debits (audited). |
| `admin.wallet-ledger` / `admin.token-ledger` | Ledger explorers. |
| `admin.payouts` | Approve payouts, mark proof uploaded/paid. |
| `admin.predictions` | Search tickets, force-settle, void. |
| `admin.settlements` | Trigger settlement or catch-up per match. |
| `admin.matches` | Manual match CRUD, status overrides. |
| `admin.match-pools` | Per-match liability + stake pool. |
| `admin.correlated-risk` | Cross-market correlation alerts. |
| `admin.risk-settings` | Emergency controls (see §7.1). |
| `admin.pricing-breakdown` | Per-market fair vs house odds inspector. |
| `admin.odds-provider` / `admin.odds-history` | API-Football sync state + movements. |
| `admin.market-rules` | Grading rule editor (per market). |
| `admin.bankroll` | Bankroll adjustments (super_admin for large moves). |
| `admin.tournament` | Outright market management. |
| `admin.simulation` | Simulation-world controls. |
| `admin.store` | CSSE store items. |
| `admin.referrals` / `admin.referred-users` | Referral analytics. |
| `admin.review` | Manual review queue (high-value tickets). |
| `admin.operations` | Cron/job status, health-check history. |
| `admin.health` | Live sync health, quota. |
| `admin.incidents` | Incident log. |
| `admin.alerts` | `operational_alerts` inbox. |
| `admin.audit` | Full `audit_log` explorer. |
| `admin.analytics` | Traffic/product analytics. |
| `admin.reconciliation` | Wallet-ledger drift checker. |
| `admin.support-ops` | Support KPIs. |
| `admin.onboarding` | Tour/onboarding config. |
| `admin.settings` | Platform settings other than risk. |

---

## 9. Support & Communications

- **Support conversations**: `support_conversations` (thread) +
  `support_messages` (turn). Users open threads from `/support`, staff
  handle them from `/management/support` and `/management/chat`.
  `support_audit_logs` records staff actions.
- **Email**: transactional emails go through a Lovable email connector.
  `email_send_state` deduplicates, `email_send_log` records outcome,
  `suppressed_emails` holds bounces/complaints,
  `email_unsubscribe_tokens` powers one-click unsubscribe. Queue is
  processed by `src/routes/lovable/email/queue/process.ts`.
- **Notifications**: `useNotifications.ts` polls a per-user feed
  (types in `notifications/types.ts`). `WinDetector` polls the
  predictions table for newly-`won` tickets and displays a celebratory
  modal.

---

## 10. Referrals, Engagement, Tokens

- **Referrals**: `referrals` table links `referrer_user_id` →
  `referred_user_id` with a stage (`signed_up`, `first_bet`,
  `funded`, `rewarded`). Referral codes generated in
  `referral-code.ts`. Reward amount is admin-configurable in
  `onboarding_settings`.
- **Engagement events**: `onboarding_events` logs tour completion,
  first-bet, first-payout, etc. `engagement.functions.ts` awards
  tokens/free-bets for milestones.
- **CSSE tokens**: separate currency from points, earned through
  engagement/referrals, spent in the store. Not withdrawable.

---

## 11. Simulation Mode

`src/lib/sim-worldcup.server.ts` + `simulator.ts` +
`simulation.functions.ts` provide a full parallel World Cup:

- Fixtures pre-seeded, `is_simulation=true` on every row.
- Bankroll = `platform_bankroll` id=2 (`kind='simulation'`).
- Simulated match minutes run on a wall-clock scaling; events, odds
  moves, and final scores are generated deterministically.
- Same settlement engine, same market catalog, but every write filters
  by `is_simulation=true`.

Purpose: onboarding demos, staff training, load-testing the
settlement path without touching real user balances.

---

## 12. Operations & Health

- `health_check_runs` — periodic ping from `/api/public/hooks/health-check.ts`
  covering DB, API-Football quota, storage, and email connector.
- `incidents` — human-authored incident log surfaced on `/status` and
  the trust center.
- `operational_alerts` — machine-authored (e.g. blocked settlement,
  quota exhausted). Visible on `/management/admin/alerts`.
- `audit_log` — append-only, 15-column log of every admin action, bet
  placement rejection, and reconciliation drift.
- `page_views` — first-party analytics table (also aggregated by the
  Lovable analytics service).

Cron schedule (pg_cron → public API hooks):
- fixtures + prematch every 30 min
- odds every 10 min pre-match, every 2 min in-play
- live stats every 60 s while any match is `live`
- fulltime settle within 2 min of finish
- reconciliation nightly at 03:00 UTC
- health check every 5 min

---

## 13. Security & RLS

- Every `public.*` table has RLS enabled and explicit GRANTs to
  `authenticated` and `service_role` (never a default `anon` grant
  unless the table is fully public read).
- Owner-scoped policies use `auth.uid()` predicates. Public read
  policies (e.g. `matches`, `market_odds_snapshots`) are `TO anon`
  SELECT-only with column projections.
- Role checks use `public.has_role(auth.uid(), 'admin')` inside
  policies; the function is `SECURITY DEFINER` to avoid recursion.
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, API-Football key, email
  provider keys) are Cloudflare env vars, never in client code.
  `supabaseAdmin` is imported dynamically **inside** server-fn
  handlers so it never leaks into client bundles.

---

## 14. Key Calculations Cheat Sheet

**Odds pricing (1X2, per selection):**

```
p_raw   = 1 / api_odds
p_fair  = p_raw / Σ p_raw
p_house = min(0.999, p_fair × (1 + margin_pct/100))
final   = max(1.01, round(1 / p_house, 2))
```

**Potential return:** `potential_return = stake × decimal_odds`.

**Per-bet caps:** ticket rejected if any of:
- `stake > max_stake_per_bet` (when > 0)
- `stake × odds > max_potential_payout`
- `odds ≥ high_odds_threshold` and `high_odds_disabled`

**Platform exposure limit:**
`max_acceptable_liability = bankroll × exposure_cap_pct`
Risk dashboard `bankroll_breach` fires when
`total_worst_case_liability > max_acceptable_liability`.

**Bankroll coverage ratio:**
`coverage = bankroll / total_worst_case_liability`.
Displayed to users on `/trust-center` when > 1 (safe).

**Referral reward:** `reward_amount` from `onboarding_settings`, credited
when `referrals.stage` advances to `rewarded`.

**Settlement decision (grouped):**

| Market | Winner condition |
|---|---|
| `1x2` HOME | `home_score > away_score` |
| `1x2` DRAW | `home_score == away_score` |
| `1x2` AWAY | `away_score > home_score` |
| `over_under_N` OVER | `home_score + away_score > N` |
| `btts` YES | `home_score > 0 AND away_score > 0` |
| `correct_score` `H-A` | exact regulation score match |
| `htft` `X_Y` | half-time == X AND full-time == Y |
| `exact_total_goals` `GOALS_k` | goals == k (or ≥5 for 5+) |
| `cards_over_under_N` OVER | `home_cards + away_cards > N` (stats) |
| `corners_over_under_N` OVER | `home_corners + away_corners > N` |
| `to_qualify` HOME | `qualifier == 'HOME'` |
| `draw_no_bet` HOME/AWAY | draws refund; wins pay as 1x2 |
| `double_chance` HOME_OR_DRAW | any of the two outcomes hits |

---

## 15. Runtime Constraints & Gotchas

- Cloudflare Workers runtime: **no** `child_process`, no `sharp`,
  no native binaries. Anything CPU/graphics heavy runs client-side
  or is off-loaded.
- **Public route loaders MUST NOT call `requireSupabaseAuth`** —
  prerender has no bearer token and will 401 the build. Public
  landing data uses the server publishable client with narrow anon
  policies.
- `supabaseAdmin` must be `await import(...)` inside handlers only,
  never at module scope of a `.functions.ts` file.
- Every schema change goes through `supabase--migration`. Never
  edit `src/integrations/supabase/{client,client.server,types,auth-*}.ts` —
  they're generated.
- Settlement of 90-minute markets uses `home_score`/`away_score`
  (regulation), never `ft_*`. The settlement helper refuses ET
  aggregates for regulation grading.

---

## 16. Cross-References

- [`RUNBOOK.md`](./RUNBOOK.md) — operational procedures (approving
  payouts, handling stuck settlements, rotating API keys).
- [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) — DB backup schedule,
  restore drills, DR checklist.
- `.lovable/plan.md` — latest implementation plan on record.

---

*Document generated 2026-07-06. When behavior changes, update this
file in the same PR that changes the code.*
