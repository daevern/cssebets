
# UFC 329 — Main + Co-Main Betting Market (with Method & Rounds)

Adds MMA alongside the World Cup product. Odds pulled from The Odds API (already wired via `ODDS_API_KEY`). Only the last two fights on the UFC 329 card (co-main + main event) are shown and bettable. Includes moneyline, method of victory, and round betting.

Scope: option (c) — real betting surface with wallet debits, settlement, and admin tooling.

---

## 1. Markets offered per fight

- **Moneyline / h2h** — Fighter A wins, Fighter B wins. (2-way, no draw for UFC.)
- **Method of Victory** — KO/TKO, Submission, Decision per fighter → up to 6 outcomes. Odds API market key: `h2h_method`.
- **Round Betting** — round 1, 2, 3 (and 4, 5 for 5-round main event), plus "goes the distance". Odds API market key: `rounds`. Main event = 5 rounds, co-main = 3 rounds (tagged per fight).

All three market types run through the existing house-margin engine (`applyOutrightMargin` in `odds-margin.server.ts`) so pricing stays consistent with WC markets.

## 2. Data model (one migration)

New public tables, all with RLS + explicit GRANTs:

- **`ufc_events`** — `event_key` (e.g. `ufc_329`), `name`, `starts_at`, `is_active`.
- **`ufc_fights`** — `event_id`, `odds_api_event_id`, `fighter_a`, `fighter_b`, `commence_time`, `card_position` (`main` | `co_main` | `other`), `scheduled_rounds` (3 or 5), `status`, `winner` (`a` | `b` | `draw` | null), `result_method` (`ko_tko` | `submission` | `decision` | null), `result_round` (int null), `settled_at`.
- **`ufc_fight_markets`** — one row per (fight, market_type, selection_key): `market_type` (`moneyline` | `method` | `round`), `label`, `odds`, `is_active`, `updated_at`. Unique on (fight_id, market_type, selection_key).
- **`ufc_market_snapshots`** — time-series (same cols + `sampled_at`) for movement sparklines.
- **`ufc_bets`** — `user_id`, `fight_id`, `market_type`, `selection_key`, `stake`, `odds_locked`, `status`, `payout`, `placed_at`, `settled_at`.

Policies:
- Read tables (`ufc_events`, `ufc_fights`, `ufc_fight_markets`, `ufc_market_snapshots`): SELECT for `authenticated` + `anon`.
- `ufc_bets`: SELECT/INSERT only where `auth.uid() = user_id`; updates only via server code using `supabaseAdmin`.

## 3. Server integration

New `src/lib/ufc-odds.server.ts`:

- `syncUfcEvent(eventKey)`:
  - `GET /v4/sports/mma_mixed_martial_arts/events` to find UFC 329 event ids.
  - `GET /v4/sports/mma_mixed_martial_arts/events/{id}/odds?regions=us,eu&markets=h2h,h2h_method,rounds&oddsFormat=decimal` for the two target fights (last 2 by `commence_time`).
  - Median across bookmakers per selection, apply house margin, upsert `ufc_fight_markets`, append `ufc_market_snapshots`.
- Small `applyMmaTwoWayMargin` helper added to `odds-margin.server.ts` for the moneyline; method + rounds reuse `applyOutrightMargin`.
- `settleUfcFight(fightId, { winner, method, round })`:
  - Moneyline → winner side.
  - Method → matching `winner_method` (e.g. `a_ko`).
  - Round → matching round bucket or `distance` if fight went full scheduled rounds.
  - Credits wallets via existing wallet-transaction helper, writes `audit_log`.

Refresh strategy (protects Odds API quota):
- New pg_cron hook `src/routes/api/public/hooks/ufc-odds-live.ts` runs the sync **every 30 s** — but only calls the API when at least one active fight is within a 4h window of `commence_time`. Zero cost outside fight night.
- Client polls the DB (not the API) **every 5 s** via `useQuery` `refetchInterval` + a Supabase realtime channel on `ufc_fight_markets` for instant push. This is the "auto-refresh every few seconds" feel without burning credits.

## 4. Server functions (`src/lib/ufc.functions.ts`)

- `listUfcFights()` — auth; returns the 2 fights + markets grouped by type.
- `getUfcMarketHistory({ fightId, marketType })` — 24h snapshots for sparkline.
- `placeUfcBet({ fightId, marketType, selectionKey, stake })` — auth; validates stake vs wallet, checks market is active, locks current odds, inserts `ufc_bets`, debits wallet atomically.
- `listMyUfcBets()` — auth; user's own bets.
- Admin-only (`has_role('admin')`):
  - `adminSyncUfc()` — manual sync trigger.
  - `adminSetUfcCard({ event, fights })` — set fighter names, card position, scheduled_rounds (in case Odds API naming needs correction).
  - `adminSettleUfcFight({ fightId, winner, method, round })` — grade all 3 market types in one call.
  - `adminVoidUfcFight({ fightId, reason })` — refund all open bets on that fight.

## 5. UI

New route `src/routes/_authenticated/ufc.tsx`:

- Header "UFC 329 — Main Card" with event time + LIVE chip.
- Two fight tiles (reuses `MarketCard` styling from `matches.index.tsx`): Main Event on top, Co-Main below. Each tile shows:
  - Fighter names, scheduled-rounds badge.
  - **Tabs**: Moneyline · Method · Rounds (pattern from `MarketTabs.tsx`).
  - Selections with live decimal odds, implied %, sparkline from `ufc_market_snapshots`.
  - Tap → bet slip.
- Bet slip sheet (reuses `CashoutSheet` pattern): selection, stake input, potential payout, confirm.
- "Updated Xs ago" chip; realtime updates without full refetch.

Admin route `src/routes/management/admin.ufc.tsx`:
- Manual sync button.
- Card mapper (fighter A / B, card position, scheduled rounds).
- Settle form: winner + method + round → settles all markets in one submit.
- Void button per fight.
- Table of open UFC bets with payout preview.

Discovery:
- Small "UFC 329" pill on `/matches` index linking to `/ufc` (avoids restructuring bottom nav).

## 6. Files touched

Created:
- `supabase/migrations/<ts>_ufc_market.sql`
- `src/lib/ufc-odds.server.ts`
- `src/lib/ufc.functions.ts`
- `src/routes/api/public/hooks/ufc-odds-live.ts`
- `src/routes/_authenticated/ufc.tsx`
- `src/routes/management/admin.ufc.tsx`
- `src/components/ufc/FightCard.tsx`
- `src/components/ufc/UfcMarketTabs.tsx`
- `src/components/ufc/BetSlipSheet.tsx`

Edited:
- `src/lib/odds-margin.server.ts` — add 2-way MMA margin helper.
- `src/routes/_authenticated/matches.index.tsx` — add UFC 329 pill.
- `src/routes/management/admin.tsx` — nav entry for UFC admin.

## 7. Setup steps after implementation

- Migration seeds the `ufc_events` row for UFC 329.
- One manual `adminSyncUfc()` populates fights + markets. If Odds API naming doesn't match the announced card, use the admin card editor to correct.
- Add a pg_cron entry pointing to `/api/public/hooks/ufc-odds-live` every 30 s during the event window (added to runbook).

## 8. Out of scope

- Non-UFC MMA events.
- Parlays across UFC selections.
- Auto-settlement from a scores feed (admin confirms — MMA feed reliability is poor).
- Prop markets beyond method + rounds (fight-of-the-night, performance bonuses, etc.).
