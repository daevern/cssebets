# Switch UFC to API-Sports MMA + match detail pages

## What I verified

Tested `https://v1.mma.api-sports.io` with the existing `API_FOOTBALL_KEY` — it works (same API-Sports account covers MMA). Endpoints available:

- `/fights?date=…` `?league=` `?season=` — card, fighters (id, name, logo), scheduled category, status
- `/fights/statistics/fighters?id={fightId}` — per-fighter strike counts, takedowns, control time, etc.
- `/fighters?id=…` / `?search=…` — record, reach, stance, DOB, weight class, photo
- `/fighters/records?id=…` — win/loss history → H2H when we intersect two fighters
- `/odds?fight=…` — 29 markets from 20 bookmakers, including: Moneyline (Home/Away), Round Betting, Method of Victory, Over/Under rounds, Fight goes the distance, Win by KO/TKO, Win by Submission, Win by Decision (unanimous/split)

**Blocker to flag:** the current API-Sports plan is **Free** (100 req/day, no live-date access — only 2 days back). Real-time odds movement + live in-fight stats need at least the **Pro** plan on api-sports.io. I'll build it to work with any tier, but live movement won't function until the plan is upgraded.

## Plan

### 1. Data layer
New file `src/lib/apimma.server.ts` mirroring `apifootball.server.ts`:
- `apiMmaGet(path, params)` with `x-apisports-key: API_FOOTBALL_KEY`, quota tracking in a new `apimma_quota` row (reuse `apifootball_quota` table structure — add `provider` column via migration, or new table `apimma_quota`).
- Helpers: `fetchFightsByDate`, `fetchFightsByLeague`, `fetchOddsForFight`, `fetchFighter`, `fetchFightStats`, `fetchFighterRecords`.

### 2. Schema migration
- Add columns to `ufc_fights`: `apimma_fight_id` (unique), `apimma_fighter_a_id`, `apimma_fighter_b_id`, `weight_class`, `is_title_fight`, `fighter_a_logo`, `fighter_b_logo`.
- New `ufc_fighters` table: id, apimma_id, name, nickname, record_w/l/d, reach, height, stance, dob, weight_class, photo_url, country.
- New `ufc_fight_stats` table: fight_id, fighter_id, strikes_landed, strikes_attempted, takedowns_landed, takedowns_attempted, control_time_sec, submission_attempts, knockdowns, updated_at (live stats).
- New `ufc_fight_h2h` table: fighter_a_id, fighter_b_id, past_fight_id, date, winner_id, method, round.
- `ufc_market_snapshots` already exists — verify columns; if missing per-selection snapshots, extend to store (fight_id, market_type, selection_key, odds, bookmaker, captured_at) for movement charts.
- GRANTs + RLS (read for authenticated on all read-only tables; writes via service role).

### 3. Odds sync (replaces `ufc-odds.server.ts` logic)
`runUfcOddsSync` rewritten:
- Pull upcoming UFC fights via `/fights?league=1&season=<year>` (UFC league id) or `date=`.
- Filter to just the next fight card (latest event by date cluster, per user's earlier ask).
- Upsert into `ufc_fights` + `ufc_fighters`.
- For each fight, call `/odds?fight={id}`, pick a stable bookmaker (bet365 with fallback chain), map:
  - Bet 2 "Home/Away" → moneyline
  - Bet 29 "Method of Victory" → method (ko_tko / submission / decision)
  - Bet 6 "Round Betting" → round
- Apply platform margin (existing `apply2WayMargin` / new `applyNWayMargin`).
- Write every pull to `ufc_market_snapshots` for the movement chart (dedupe if odds unchanged).
- Delete old moneyline-derived Method/Round modelling code.

### 4. Cron
Existing `/api/public/hooks/ufc-odds-live` route stays; interval already 30s. Add rate-limit awareness (respect quota, back off if plan cap hit).

### 5. Match detail page — `/ufc/$fightId`
New route `src/routes/_authenticated/ufc.$fightId.tsx`, styled after `/matches/$matchId`:
- **Header:** poster (both fighter photos), names, weight class, card position, scheduled rounds, countdown.
- **Live odds panel** (Moneyline / Method / Round tabs) — same bet slip flow as current `ufc.tsx`.
- **Market movement chart** — Recharts line chart, one line per selection, X = time, Y = decimal odds; source: `ufc_market_snapshots`. Reuse the pattern from `src/components/matches/MarketAnalyticsCard.tsx`.
- **Tale of the tape** — side-by-side record, reach, height, stance, age, country from `ufc_fighters`.
- **Live fight stats** — strikes/takedowns/control time from `ufc_fight_stats` when fight is live; hidden pre-fight. Auto-refresh via realtime subscription on `ufc_fight_stats`.
- **H2H** — previous meetings from `ufc_fight_h2h` (empty state if none).

Add link from each card on `/ufc` list → `/ufc/$fightId`.

### 6. Server functions
`src/lib/ufc.functions.ts` additions:
- `getUfcFightDetail({ fightId })` — returns fight + fighters + latest markets + stats + h2h.
- `getUfcMarketHistory({ fightId, marketType })` — snapshots for the chart.
- Existing `listUfcFights`, `placeUfcBet`, admin fns untouched except payload shape now carries real Method/Round odds.

### 7. Admin page
`admin.ufc.tsx` gets a small "Sync fighters + stats" button (calls a new admin fn that pulls `/fighters` and `/fights/statistics` for the current card). Refund/void/settle flows unchanged.

### 8. Cleanup
- Remove Odds API import path from `ufc-odds.server.ts` entirely; keep only API-MMA path.
- Leave `ODDS_API_KEY` secret in place (used elsewhere? — will grep; if UFC-only, note it can be removed).

## Technical notes

- API-Sports MMA UFC league id needs one-time lookup via `/leagues` on first sync (cached in `platform_settings`).
- Bookmaker preference chain: bet365 (5) → Pinnacle (9) → Betfair (18) → first available.
- Method of Victory mapping needs care: API's "Home Win by KO/TKO/DQ" etc. are per-fighter; we'll aggregate into per-fighter method selections (`fighter_a_ko`, `fighter_a_sub`, `fighter_a_dec`, same for B) — richer than current 3-option model. UI Method tab becomes 6 buttons.
- Round Betting is per-fighter per-round too; UI stays "select fighter → round" collapsible.
- Snapshots for the chart: capture every 30s only if any odds value changed vs last snapshot (avoid table bloat).

## User action required after build

Upgrade the API-Sports account to at least the **Pro** plan (~€19/mo) so live in-fight dates and >100 req/day work. Free plan will still populate the page but odds won't move in real time and live stats won't appear.
