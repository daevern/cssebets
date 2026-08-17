# CSSEBets — System Overview

> A complete reference to what CSSEBets is, how every feature works, the
> math behind odds and risk, and how the admin/staff systems operate.
>
> Companion documents: [`RUNBOOK.md`](./RUNBOOK.md) (day-to-day operational
> procedures), [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) (disaster
> recovery).

---

## 0. Document Authority & Status Conventions

This document is descriptive, not normative. Where this file and the
code/database disagree, **the code and database win** — and the
disagreement is a bug in this file, to be fixed in the same PR.

### 0.1 Status legend

Every capability below is tagged with one of:

| Tag | Meaning |
|---|---|
| **LIVE** | Running in production and authoritative for real money. |
| **SHADOW** | Running and writing data, but not yet authoritative; a legacy path still decides. |
| **LEGACY** | Still authoritative today, but scheduled for replacement. |
| **PLANNED** | Specified and/or scaffolded, not in effect. |

Untagged text is LIVE.

### 0.2 Canonical source for every financial and risk value

Exactly one source per value. Anything else that appears to hold the
same number is a derived cache or a display convenience and must never
be used for a decision.

| Value | Canonical source | Notes |
|---|---|---|
| User points balance | `wallet_transactions` (append-only ledger) | `wallets.balance` is a maintained cache; `run_reconciliation_check` proves the two agree. |
| House bankroll | **`accounting_account_balances.HOUSE_BANKROLL`** (per `environment`) | **LIVE / authoritative** for arcade **and** sports (football/F1/UFC, Phase B, since 2026-08-06). `platform_bankroll` id=1 is now fully **LEGACY**: kept as a display-only lifetime cache and reconciliation cross-check; no placement or settlement path treats it as authoritative. Admin UI reads the journal via `readAuthoritativeBankroll()`; compare the two with `accounting_bankroll_reconciliation(env)`. |
| House P/L | `accounting_pl_report()` over posted journals | Covers all journal-enabled products (§7.6) — arcade and sports as of Phase B. Losing rounds have no `PAYOUT_SETTLED` journal (a zero-amount journal line is forbidden by `acct_line_one_side`), so settlement basis realises them at their liability-reservation release time. `platform_bankroll.total_stakes_collected / total_payouts_paid` remain LEGACY lifetime counters, retained for historical continuity only. |
| Reserved liability (arcade + sports) | `accounting_liability_reservations` (active, `liability_enforced`) | Authoritative for placement capacity across every product, enforced via `accounting_assert_capacity()` (arcade's `accounting_arcade_assert_capacity` now delegates to it; sports enforces it via `BEFORE INSERT` triggers on `predictions` / `ufc_bets` / `f1_bets` / `f1_championship_bets`). |
| Worst-case exposure (sports) | `accounting_available_reserve(env)` (Phase B) | **LIVE.** `getRiskDashboard` recomputation from pending `predictions` remains a useful display/alerting view but no longer gates placement. `matches.worst_case_exposure` / `*_liability` are denormalised caches refreshed on placement — display only. |
| Available bankroll | `accounting_available_reserve(env)` | `bankroll − active enforced reservations − outstanding payables`. See §7.3 for the older sports-only figure. |
| Displayed odds | `match_market_odds` (football), `f1_race_markets`, `ufc_fight_markets` | `matches.reference_odds` is the drift-check copy used at placement only. |
| Price a ticket was struck at | `predictions.odds` + bound `match_odds_snapshots.id` | Immutable after placement. |
| Risk limits / kill switches | `platform_settings` row `id=1` | Live values, not code defaults (§7.1). |
| Monetary rounding | `acct_round_money/stake/payout/liability` (DB) | `src/lib/accounting/money.ts` is a mirror for display; the DB decides. |

---

## 1. Product Overview

CSSEBets is a **points-based prediction market** covering **football
(soccer), Formula 1, UFC/MMA and a house-banked arcade**. It looks and
feels like a sportsbook, but every stake is denominated in **points**
rather than fiat. Points are issued to approved users by staff after
off-platform value transfer (proof-of-payment uploaded to a "point
request"), and users can request **payouts** back out through the same
staff-mediated flow.

All **real-world** odds are derived from live paid data providers —
**API-Football**, **API-F1** and **API-MMA** — repriced through the
house margin model; none are invented. The one exception is the
**Simulation** world (§11), whose fixtures, odds moves and results are
generated deterministically and are flagged `is_simulation=true`
everywhere. Arcade games are house-priced by design (fixed paytables)
and provably fair via server-side seeded RNG with per-round
verification.

Money movement runs on a double-entry accounting ledger with liability
reservations, a 2-decimal half-up rounding policy and automated invariant
tests (§7.6). **Status today (since Phase B, 2026-08-06): the full arcade
lobby (12 CSSE Originals including Plinko, Roulette, Treasure Grid,
Blackjack, Dice, Keno, Wheel, Hi-Lo, Crash, Towers, Poker, RPS) and sports
(football, F1, UFC) are all LIVE on the unified journal**, with capacity
enforced from
`accounting_available_reserve()` for every product. `platform_bankroll`
is retained as a LEGACY display/reconciliation cache only — it is written
for historical continuity but no placement or settlement decision reads
it.




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
  check, reconciliation trigger). Every hook requires `CRON_HOOK_SECRET`
  via `Authorization: Bearer …` or `x-cron-secret` (`src/lib/cron-auth.server.ts`);
  production fails closed if the secret is unset.
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

### 3.2 Guest mode

Anonymous Supabase sign-in is enabled. Visitors landing on `/` are
auto-minted a guest session (with a timeout fallback so the page never
hangs) and get full read access to the app — fixtures, markets,
analytics, arcade previews. Any money action (place a bet, top up,
cash out) opens `GuestAuthPrompt` / a login modal instead. In guest
mode the hamburger nav shows a **Register / Log in** button rather than
sign-out, the referral code is masked (`XXXXXXX`), and the tour and
PWA install prompts are suppressed.

### 3.3 Authenticated app (`_authenticated/`)

| Route | Purpose |
|---|---|
| `/dashboard` | Home: next fixture, next race (F1) and next fight (UFC) cards, engagement tiles, wallet snapshot, referral panel. |
| `/f1`, `/f1/races`, `/f1/races/:raceId` | F1 season hub, race index and race markets/analytics. |
| `/ufc`, `/ufc/fights`, `/ufc/:fightId` | UFC event hub, full card index and fight markets. |
| `/arcade` + `/arcade/{plinko,roulette,treasure,blackjack,dice,keno,wheel,hilo,crash,towers,poker,rps}` | House-banked arcade (12 CSSE Originals). |
| `/leagues`, `/leagues/:leagueId` | Private leagues: standings (multi-sport), activity, invite codes, chat. |
| `/matches` | List of upcoming/live fixtures grouped by day. |
| `/matches/:matchId` | Full market grid (`MarketTabs.tsx`), analytics card, free-bet redemption, prediction placement. |
| `/my-predictions` | Every ticket the user has placed with status (pending / won / lost / void) and payout. |
| `/bets` | Alias for the tickets ledger with filters. |
| `/wallet` | Balance, transactions, point-request submission (with proof upload to `point-request-proofs` storage bucket). |
| `/payout` | Payout request lifecycle (pending → approved → proof_uploaded → completed). |
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

Global UI pieces: `BottomNav` (Home · Matches · F1 · UFC · Wallet —
Payout and Markets were removed; the F1/UFC tabs deep-link to the
fixture indexes), `TopBar` (badge counts, guest "Log in" pill),
`HamburgerMenu` (liquid-drop expansion holding wallet balance, token
balance, referral code, store, info pages and sign-out),
`SportBadge` (official F1/UFC marks), `WinDetector` (polls for newly
settled winning tickets and pops `WinTicketModal`), `TourProvider`
(walkthroughs in `tours.config.ts`, completion persisted so it shows
once), `WelcomeModal` (first-run, hidden for guests).

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

Margin is **not** a code constant — the canonical value is
`platform_settings.margin_pct` (currently **25**), and
`apply_margin_to_real` gates whether it is applied to the real world at
all. **Status: Phase B defaults `apply_margin_to_real = true` on fresh
DBs** (migration `20260817210000_phase_b_risk_hardening`); confirm the
live row on `/management/admin/risk-settings` after deploy and refresh
odds. Always read the live row (§7.1) before quoting a margin anywhere.

Same algorithm applies to N-way outrights (`applyOutrightMargin`).

### 4.4 Market movement history

Every odds refresh writes a row to `market_odds_snapshots` /
`match_odds_snapshots`. `MarketAnalyticsCard` (with `publicMode`) renders
a delta line so users can see how the house re-priced the match. Public
mode disables realtime subscriptions and reads the same data via the
anon-safe `getMarketHistoryPublic`.

---

### 4.5 Formula 1 (`src/features/f1/`)

Sourced live from the **paid API-F1** subscription (no generated odds).

- Sync: `f1Sync.server.ts` (season, races, drivers, constructors),
  odds built by `f1OddsBuilder.server.ts` through the same fair-odds +
  house-margin pipeline as football.
- Markets: race winner, podium, points finish, **top 5 finishers**,
  teammate head-to-head (rendered as "Will X beat Y?" yes/no cards with
  decimal odds), fastest lap, top constructor in race.
- Pages: `/f1` (season hub), `/f1/races` (fixture index, mirrors
  `/matches`), `/f1/races/:raceId` (markets, movement chart with a
  driver-filter dropdown defaulting to the top 3 favourites,
  `StakeSlip` bet slip, live race stats, post-race analytics).

### 4.6 UFC / MMA

Sourced from **API-MMA** via `src/lib/apimma.server.ts` and
`ufc-odds.server.ts`.

- `runUfcEventDiscovery` + `runUfcOddsSync` keep the active event and its
  **full card** (main + co-main + prelims) current; fights upsert on
  `ufc_fights.apimma_fight_id`.
- Markets: **Fight Winner (moneyline) is the only public market.** Method /
  round / total-rounds rows may exist for admin grading but are
  `is_active=false` for members — the MMA fights feed does not return
  finish method or round, so those props are not sold publicly.
- Pages: `/ufc`, `/ufc/fights` (Live / Upcoming / Completed),
  `/ufc/:fightId`.

### 4.7 Arcade (`src/lib/arcade/`, `src/components/arcade/`)

House-banked instant games, all provably fair (server-side seeded
shuffle/RNG with a verify dialog per game). Lobby lists **twelve** CSSE
Originals:

| Game | Server fns | Notes |
|---|---|---|
| Plinko | `plinko.functions.ts` | Cosmetics + configurable risk rows |
| Roulette | `roulette.functions.ts`, `roulette-math.ts` | European wheel |
| Treasure Grid | `treasure.functions.ts`, `treasure-math.ts` | Mines-style grid |
| Blackjack | `blackjack.functions.ts`, `blackjack-math.ts` | Insurance, splits, pre-deal exposure ceiling |
| Dice / Keno / Wheel / Hi-Lo | `mini.functions.ts`, `mini-math.ts` | Mini tables sharing the mini engine |
| Crash / Towers / Poker / RPS | dedicated modules under `src/lib/arcade/` | Flagship craft tables |

Every round debits/credits the real wallet atomically and posts to the
accounting journals with a liability reservation held for the maximum
payout until the round resolves.

---

## 5. Bet Placement & Wallets

### 5.1 Wallet model

- `wallets`: one row per `(user_id, is_simulation)`, holds current
  `balance` (points, integer-ish DECIMAL).
- `wallet_transactions`: append-only ledger. The DB enums are the
  authority:
  - `wallet_txn_type` ∈ {`credit`, `debit`, `refund`, `adjustment`}.
  - `wallet_ref_type` ∈ {`bet_placement`, `bet_settlement`,
    `point_request`, `payout`, `admin_adjustment`, `house_bankroll`}.

  Voids/refunds are `type='refund'` with `reference_type='bet_settlement'`
  (there is no `bet_void` reference type). Free bets, store purchases and
  token movements do **not** create wallet rows — free bets live in
  `csse_free_bets`, tokens in `csse_token_transactions`; only the points
  effect of a settled free bet reaches the wallet.

`wallets.balance` is a cache. The ledger is the source of truth
(§0.2), and `reconciliation.functions.ts` proves they agree. Every
write to `wallets.balance` is paired with a `wallet_transactions` row
inside a single Postgres RPC.

### 5.2 Placement flow (`submitPrediction`)

Defined in `src/lib/predictions.functions.ts`. Order of checks:

1. **Role gate** — user must hold `member`, `admin` or `super_admin` in
   `user_roles`. New sign-ups (and guest sessions, §3.2) have no
   betting role and must be approved by staff, so a guest hits the
   sign-in prompt before this check is ever reached.

2. **Rate limit** — `enforceRateLimit(user:${uid}, 'bet_placement')` via
   `rate_limits`. Exceeding it writes an `audit_log`
   `rate_limit_triggered` entry visible on the risk-settings page.
   Money and auth actions **fail closed** if the rate-limit RPC errors
   (reject with retry); only non-money actions such as support messaging
   may fail open.
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

`payout_requests` lifecycle. The authority is the DB enum
`payout_request_status` ∈ {`pending`, `approved`, `proof_uploaded`,
`completed`, `rejected_by_admin`, `rejected_by_user`}:

```
pending  ──admin approve──▶  approved  ──staff pays off-platform──▶
proof_uploaded  ──user confirms receipt──▶  completed
        └── rejected_by_admin / rejected_by_user (debit reversed)
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
  refunds every stake, writing wallet rows with `type='refund'` and
  `reference_type='bet_settlement'` (§5.1).
- Individual prediction voided when settling that market is impossible
  (e.g. no card stats) — stake refunded, others in the same match still
  settle.

### 6.5 Catch-up

`settle-catchup.functions.ts` finds `finished` matches with pending
predictions and re-runs settlement. Runs on-demand from the admin
settlements page and can be scheduled via the reconciliation hook.

---

### 6.6 F1, UFC and arcade settlement

- **F1** — `src/features/f1/services/f1Settlement.server.ts` grades from
  the API-F1 classification (race winner, podium, points finish,
  top 5 finishers, teammate H2H, fastest lap, top constructor).
  `runF1AutoSettle` picks up races with `settled_at IS NULL`; markets are
  suspended automatically once the race goes live
  (`f1_live_race_state` + a pg_cron suspension job).
- **UFC** — `src/lib/ufc-odds.server.ts` handles sync/settlement.
  `runUfcEventDiscovery` rotates the active event so the app always shows
  the next card; markets close one minute before walk-outs. A sweep in
  `runUfcAutoSettle` voids and refunds markets whose API-MMA result is
  still missing 12 h after the event.
- **Arcade** — settles instantly and atomically inside its RPC
  (`arcade_*_settle`), posting stake, payout and house P/L to the
  accounting journals in the same transaction as the wallet movement.

---

## 7. Risk Management (Admin)

### 7.1 Platform settings

Row `id=1` in `platform_settings` is the **only** authority for risk
limits. Code defaults exist purely as a fallback if the row can't be
read, and they are not the operating values. The "Live" column below is
a snapshot taken 2026-07-31 — re-read the row rather than trusting it.

| Field | Code fallback | Live (2026-07-31) | Purpose |
|---|---|---|---|
| `margin_pct` | 25 | 25 | House overround target |
| `apply_margin_to_real` | true | **true** (Phase B default) | Fresh DBs set true via `20260817210000_phase_b_risk_hardening`; confirm on live `/management/admin/risk-settings` after deploy |
| `exposure_cap_pct` | 0.6 | 0.6 | `worst_case_liability ≤ bankroll × this` |
| `max_stake_per_bet` | 5000 | **50000** | Hard cap per ticket (0 = off) |
| `max_potential_payout` | 50000 | **100000** | Hard cap on stake × odds |
| `bets_paused` | false | false | Global kill switch |
| `correct_score_disabled` | false | false | Retail-abuse market kill |
| `high_odds_disabled` | false | false | Reject longshots |
| `high_odds_threshold` | 50 | 50 | Threshold for above |
| `disabled_markets` | `{}` | `{}` | Per-market kill switch (text[]) |
| `max_bets_per_user_per_match` | 0 | 0 | 0 = unlimited |

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

Then aggregates across matches to a platform total. Placement capacity
is decided against `accounting_available_reserve(env)` (Phase B); this
dashboard total is compared against `platform_bankroll` id=1,
`kind='live'`, `is_active=true` for **display/alerting only** — a LEGACY
reference point, not the capacity source. If that row is missing or
nulled, the dashboard refuses to compute and raises a critical alert.

Authority note: this recomputation from pending `predictions` is the
canonical sports exposure figure. `matches.worst_case_exposure` and
`matches.<home|draw|away>_liability` are denormalised caches written at
placement — fine for sorting and display, never for a limit decision.


Alert types:
- `outcome_dominance` — one outcome carries > `userExposurePct` of match
  liability.
- `user_exposure` — a single user > threshold of a match's stake.
- `bankroll_breach` — worst-case > bankroll × `exposureCapPct`.
- `total_liability` — aggregate liability > safety ratio.

Recommendations per match: `accept`, `limit_stake`, `reduce_odds`,
`close_market`.

### 7.3 Bankroll

`platform_bankroll` singleton per `kind` — **fully LEGACY as of Phase B**
(2026-08-06). Every product (arcade and sports) now decides capacity
against the accounting journal; this table is a display/reconciliation
cache only:

| Column | Meaning | Authority |
|---|---|---|
| `balance` | Historical chips figure, still updated for continuity | LEGACY — `accounting_account_balances.HOUSE_BANKROLL` is canonical |
| `total_stakes_collected` | Lifetime sum of stakes debited on placement | LEGACY counter — use `accounting_pl_report()` for P/L |
| `total_payouts_paid` | Lifetime sum of payouts credited on win | LEGACY counter — same |
| `house_user_id` | Wallet that receives/pays for the house | Canonical (unaffected by the journal migration) |

`platform_transactions` mirrors every bankroll change. Admin operators
adjust via `/management/admin/bankroll`, which now prefers the journal
balance (`readAuthoritativeBankroll()`) and falls back to this legacy row
only if the journal read fails — see the `source` field returned by
`getBankrollOverview`.

**Two "available bankroll" figures exist. They are not the same number
and must not be swapped:**

| Figure | Formula | Source | Use |
|---|---|---|---|
| Sports available balance (LEGACY) | `balance − Σ matches.worst_case_exposure` (scheduled/live) | `getBankrollOverview` in `src/lib/bankroll.functions.ts` | Admin bankroll page display only — no longer a capacity gate |
| Available reserve (**canonical**) | `balance − active enforced reservations − outstanding payables` | `public.accounting_available_reserve(env)` | Placement capacity checks for arcade **and** sports (Phase B), Phase 9 reporting |

The legacy figure ignores journal payables and reservations; the
canonical one ignores nothing and is now the sole capacity decision for
every product. Any new capacity decision must use
`accounting_available_reserve`. Convergence happens when sports moves
onto the journal (§7.6).

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

### 7.6 Accounting core (Phases 1–10)

Every money movement (arcade and sports) now runs on the double-entry
accounting layer. Each phase has its own spec in
[`docs/accounting/`](./accounting/) and its own SQL self-test function.
Phases 1–10 (infrastructure) and Phase B (sports migration) are both
complete — see the status table below for per-environment detail.

**Per-product journal status** (authority: `accounting_migration_flags` /
`accounting_migration_flag_envs`, snapshot 2026-08-06 / Phase B):

| Product | `journal_enabled` | `liability_enforced` | Status |
|---|---|---|---|
| Plinko | yes | yes | **LIVE** |
| Roulette | yes | yes | **LIVE** |
| Treasure Grid | yes | yes | **LIVE** |
| Blackjack | yes | yes | **LIVE** |
| Football | yes (PRODUCTION + SIMULATION) | yes | **LIVE** (Phase B step 4 cutover) — `platform_bankroll` retained as LEGACY display cache only |
| F1 | yes (PRODUCTION + SIMULATION) | yes | **LIVE** (Phase B step 4 cutover) |
| UFC | yes (PRODUCTION + SIMULATION) | yes | **LIVE** (Phase B step 4 cutover) |
| `sports_generic` | no | no | **PLANNED** — every live betting surface maps to football/F1/UFC tables today, so this is intentionally unbuilt |

Sports capacity is enforced via `accounting_assert_capacity()` through
`BEFORE INSERT` triggers on `predictions`, `ufc_bets`, `f1_bets`, and
`f1_championship_bets` (mirrors arcade's `accounting_arcade_assert_capacity`,
which now delegates to the same shared function). `accounting_pl_report()`
and `accounting_available_reserve()` cover arcade **and** sports as of
Phase B; the sports-only recomputation in §7.2 / §7.3 remains for display
and alerting but is no longer the capacity authority.

Known open items from the Phase B rollout (tracked, not launch-blocking):
a two-session concurrency re-verification for sports placement was not
re-run post-cutover (sports reuses the same advisory-lock path proven in
Phase 6.1); and `accounting_phase10_selftest` reports 3 pre-existing
arcade-only findings (Treasure reservation-while-open, ~530 legacy
wallet-credit mismatches, arcade P/L-to-reserve gaps) that predate and are
unrelated to this migration.



| Phase | Scope | Self-test |
|---|---|---|
| 1 | Ledger verification baseline | `phase1_verification.sql` |
| 2 | Wallet ↔ ledger reconciliation | `run_reconciliation_check` |
| 3 / 3.1 | Journal foundation + hardening (balanced debits/credits) | — |
| 4 / 4.1 | Arcade (Plinko) posting + unified house bankroll | — |
| 5 | Arcade migration onto the ledger + production controls | — |
| 6 / 6.1 | Liability reservation (`accounting_liability_reservations`), versioning, `liability_enforced` flag | 13/13 |
| 7 | Blackjack payout cap — no silent truncation, pre-deal exposure ceiling | `arcade_bj_phase7_selftest()` 9/9 |
| 8 | Global monetary rounding policy (2dp, half-up; liability rounds up) | `accounting_phase8_selftest()` 14/14 |
| 9 | Unified P/L reporting from posted journals | `accounting_pl_report()` |
| 10 | Automated invariant + lifecycle test suite | 40/40 |

Key rules:

- **Money scale** is exactly 2 decimals everywhere; money columns are
  `numeric(_,2)`. Rounding is half-up, except liability/exposure which
  always rounds **up** so reservations never under-cover. DB helpers:
  `acct_round_money/stake/payout/liability`; the TS mirror is
  `src/lib/accounting/money.ts` (`roundMoney`, `roundPayout`,
  `roundLiability`, `potentialPayout`, `formatPoints`).
- **Liability reservations** are taken at placement/deal time and handed
  off atomically to payable at settlement. Canonical available bankroll
  = bankroll − active enforced reservations − outstanding payables,
  exposed by `accounting_available_reserve(env)` (§7.3). Currently
  reserves arcade positions only.
- **Environments** (`PRODUCTION` / `SIMULATION` / `TEST`) are tagged on
  every journal so real and simulated exposure never mix.
- **P/L reporting**: `public.accounting_pl_report()` (settlement or
  placement basis, filterable by product/game/sport/user/date) backs the
  admin page `/management/admin/pl-report`. Pending liability is
  computed historically "as of" the report end date. It labels each
  product `journal-enabled` / `shadow` / `disabled` / `legacy`, matching
  the status table above.

---

## 8. User Management (Staff)

### 8.1 Roles

Stored in `user_roles` (separate table — never on `profiles`).
Authority is the DB enum `app_role`: `pending`, `member`, `viewer`,
`customer_support`, `admin`, `super_admin`. (There is no `user` or
`moderator` value — earlier drafts of this doc listed them in error.)

Access is checked via `has_role(_user_id, _role)` (security-definer,
avoids RLS recursion). Codepaths use `requireTier(...)` helpers.

- `pending` — signed up / awaiting staff approval; no play.
- `member` — approved user; can place bets.
- `customer_support` — support & chat only.
- `viewer` — read-only admin dashboards.
- `admin` — full admin console (users, risk, payouts, bankroll, etc.).
- `super_admin` — plus staff management, secrets, destructive ops.

A guest (anonymous) session has **no** row in `user_roles` at all,
which is what blocks betting in §5.2.

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
| `admin.predictions` | Search tickets (football, F1 and UFC), force-settle, void. |
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
| `admin.pl-report` | Unified P/L report (Phase 9) — settlement or placement basis, filterable by product/game/sport/user/date. |

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
- Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_HOOK_SECRET`, API-Football
  key, email provider keys) are Cloudflare env vars, never in client
  code. `supabaseAdmin` is imported dynamically **inside** server-fn
  handlers so it never leaks into client bundles. Public cron hooks
  never accept the publishable/anon key as privilege.

---

## 14. Key Calculations Cheat Sheet

Each formula names its single canonical input (§0.2).

**Odds pricing (1X2, per selection)** — only when
`platform_settings.apply_margin_to_real = true`; otherwise
`p_house = p_fair`:

```
p_raw   = 1 / api_odds
p_fair  = p_raw / Σ p_raw
p_house = min(0.999, p_fair × (1 + margin_pct/100))
final   = max(1.01, round(1 / p_house, 2))
```

**Potential return:**
`potential_return = acct_round_payout(stake × decimal_odds)`
— 2dp, half-up. Liability derived from it rounds **up**
(`acct_round_liability`). The DB helpers are canonical;
`src/lib/accounting/money.ts` mirrors them for display.

**Per-bet caps** (values from `platform_settings` id=1, not code):
ticket rejected if any of:
- `stake > max_stake_per_bet` (when > 0)
- `stake × odds > max_potential_payout`
- `odds ≥ high_odds_threshold` and `high_odds_disabled`

**Platform exposure limit (sports, LEGACY display alert):**
`max_acceptable_liability = platform_bankroll.balance × exposure_cap_pct`
Risk dashboard `bankroll_breach` fires when
`total_worst_case_liability > max_acceptable_liability`, where the
liability is recomputed from pending `predictions` (§7.2), not read
from `matches.worst_case_exposure`. This is an operator alert, not the
placement gate — see below.

**Placement capacity (arcade + sports, LIVE journal path):**
`accounting_available_reserve(env) ≥ worst-case payout of this round`,
checked via `accounting_assert_capacity()` inside the placement RPC
(arcade) or a `BEFORE INSERT` trigger (sports — `predictions`, `ufc_bets`,
`f1_bets`, `f1_championship_bets`). This is the actual accept/reject
decision for every product since Phase B.

**Bankroll coverage ratio:**
`coverage = platform_bankroll.balance / total_worst_case_liability`.
Displayed to users on `/trust-center` when > 1 (safe). This is a legacy
display figure; the underlying accept/reject decision is
`accounting_available_reserve(env)` above.

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

- [`docs/accounting/`](./accounting/) — phase-by-phase accounting
  specifications (`phase1-verification.md` … `phase10-automated-tests.md`).
  These are the authority for journal, reservation and rounding
  behaviour; §7.6 here is a summary only.
- [`RUNBOOK.md`](./RUNBOOK.md) — operational procedures (approving
  payouts, handling stuck settlements, rotating API keys).
- [`BACKUP_RECOVERY.md`](./BACKUP_RECOVERY.md) — DB backup schedule,
  restore drills, DR checklist.
- `.lovable/plan.md` — latest implementation plan on record.

---

*Document last updated 2026-07-31 — consistency & authority pass:
canonical source table (§0.2), LIVE/SHADOW/LEGACY/PLANNED status tags,
corrected role, wallet and payout enums, live vs fallback risk settings,
and the two distinct "available bankroll" figures. Live values quoted
here are snapshots; the database is the authority. When behaviour
changes, update this file in the same PR that changes the code.*

