
# World Cup 2026 Prediction Pool — Plan

A private, invite-only web app where friends predict WC 2026 matches with virtual stakes. No real money. Dark sports-dashboard look, mobile-first, big match cards.

## Stack
- TanStack Start + React + Tailwind + shadcn (existing template)
- Lovable Cloud (Supabase) — auth, DB, server functions
- Football-Data.org API for fixtures/live scores (admin-triggered sync via server function; key stored as secret)
- No odds API (Football-Data has none) — "Reference odds" column will be a static/admin-entered field, clearly labeled "Reference only"

## Auth & roles
- Supabase email/password auth
- `profiles` table (display name, avatar)
- `user_roles` table + `app_role` enum (`admin`, `member`, `pending`) + `has_role()` security-definer function
- Signup creates profile with role `pending`; admin approves to `member` from Admin Panel
- Pending users see a "Waiting for approval" screen
- First admin seeded manually (insert into `user_roles`)

## Database schema
- `profiles(id, display_name, avatar_url, created_at)`
- `user_roles(user_id, role)` — admin/member/pending
- `leagues(id, name, created_by, created_at)` — supports multiple leagues; default "Main Pool"
- `league_members(league_id, user_id, joined_at)`
- `matches(id, external_id, stage, group_name, home_team, away_team, kickoff_at, status, home_score, away_score, winner)` — synced from API
- `predictions(id, user_id, match_id, market, outcome, reference_odds, virtual_stake, potential_return, status, created_at)`
  - `market`: `result | correct_score | total_goals | btts | first_scorer | tournament_winner`
  - `outcome`: text (e.g. "HOME", "2-1", "OVER_2.5", "YES", "Mbappé", "France")
  - `status`: `pending | won | lost | void`
- `audit_log(id, user_id, action, entity, entity_id, metadata, created_at)` — every prediction insert + admin actions
- RLS on all tables; members read league data, write own predictions only when `kickoff_at > now()` and prediction doesn't already exist for that (user, match, market)

## Scoring (virtual P&L)
- On settlement, `won` predictions credit `virtual_stake * reference_odds`; `lost` credits 0; `void` refunds stake
- Bonus point scoring per spec (3/5/10/25) tracked separately as a `points` column on prediction for the leaderboard
- Leaderboard ranks by total points (primary) and net virtual P&L (secondary)

## Server functions (`src/lib/*.functions.ts`)
- `syncMatches` (admin) — fetch fixtures from Football-Data, upsert
- `syncLiveScores` — pull live + finished match scores (admin button; optional cron later)
- `submitPrediction` — validates kickoff lock, inserts prediction + audit row
- `settleMatch` (admin or auto when status=FINISHED) — marks predictions won/lost, awards points
- `approveUser` / `setRole` (admin)
- `createLeague`, `addMember` (admin)

All protected with `requireSupabaseAuth`; admin-only ones check `has_role(userId, 'admin')`.

## Routes
- `/auth` — login/register
- `/_authenticated/` layout (gate)
  - `/` Dashboard — next match, your standing, recent predictions
  - `/matches` — list (upcoming/live/finished tabs), big cards
  - `/matches/$id` — match details + prediction form (market selector → outcome → virtual stake → confirm); locked banner if kicked off
  - `/my-predictions` — history with won/lost color indicators
  - `/leaderboard` — points + virtual P&L
  - `/admin` — admin-only: pending users, sync matches, settle results, manage leagues

## UI
- Dark theme, green (#22c55e) win / red (#ef4444) loss accents, large rounded match cards, bottom tab nav on mobile
- Prediction flow ≤4 taps: card → market chip → outcome → confirm
- "Reference odds" badge styled muted with tooltip "For reference only — no real money involved"

## Secrets needed
- `FOOTBALL_DATA_API_KEY` — requested after Cloud is enabled

## Build order
1. Enable Lovable Cloud
2. Migration: enum, tables, RLS, grants, `has_role`, seed Main league
3. Auth pages + `_authenticated` layout + pending-approval screen
4. Server functions (sync, submit, settle, admin)
5. Pages: Dashboard, Matches, Match Details, My Predictions, Leaderboard
6. Admin Panel
7. Wire Football-Data sync, request API key
8. Polish, dark theme, mobile nav

## Out of scope (explicit)
- Real money, wallets, withdrawals
- Live odds API (none free; static reference column instead)
- Push notifications, mobile native
- Automatic cron sync (manual admin button v1; can add pg_cron later)
