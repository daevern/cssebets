# Market Chart Trade Ticker + Darker Theme

## 1. Trade ticker overlay on `MarketAnalyticsCard`

Applies automatically to both the landing page and `/matches/$matchId` (analytics page) since both render the shared `MarketAnalyticsCard` component.

**Floating trade prints (Kalshi-style)**
- Overlay small pill-shaped "trade prints" that float up from the current price point of each outcome line: `+75`, `+35`, `+56`, etc. (points staked on that outcome).
- Colored per outcome (HOME=green, DRAW=blue, AWAY=pink) to match the existing line colors.
- Each print fades in at the line's right-edge endpoint, drifts upward ~40px over ~2s, and fades out.
- Source of data:
  - Query recent rows from `match_pool_transactions` for this `match_id` (last ~60s), ordered by `created_at desc`, and stream them out one at a time on a short interval.
  - If fewer than ~3 real trades exist, **loop** the available set continuously (re-emit with slight jitter in timing) so the ticker always feels alive.
  - If zero real trades exist, synthesize a small deterministic loop from `hashString(matchId)` seeded amounts (e.g. 3 fake prints between +15 and +120) so a match with no activity still shows movement — clearly labeled internally as demo but visually identical.

**Total traded volume badge**
- Add a badge in the chart header row: `● 12,480 pts traded` (sum of `stake` in `match_pool_transactions` for the match, or `total_pool` from `match_stake_pools`).
- Refresh every 5s alongside the existing history query.
- Small pulse animation each time the total increases.

**Freeze at match end**
- When `match.status` is a finished state (`FT`, `AET`, `PEN`, `finished`), stop the LIVE tape animation and the trade ticker, and force the final chart point to `100%` for the winning outcome and `0%` for the losing outcome(s). For a draw: DRAW=100%, HOME/AWAY=0%. For over/under & similar binary markets, snap winner=100/loser=0 based on final stats already on `matches`.
- Range pills still work (1D/1W/1M/ALL) but the LIVE pill shows a static "SETTLED" state (no ping dot, no ticker).

## 2. New server function

Add `getRecentTrades({ matchId })` in `src/lib/market-history.functions.ts`:
- Public variant (no auth) returning last 30 rows: `{ outcome_key, stake, created_at }` from `match_pool_transactions` (project only these columns; add a narrow `TO anon` SELECT policy if missing — otherwise use an authenticated variant and swap by `publicMode`).
- Also returns `totalVolume` (sum of stakes) and `matchStatus` + `winningOutcomeKey` (derived from `matches`) so the chart can freeze correctly.

## 3. Darker global background

In `src/styles.css`, deepen the surface tokens so every page matches the landing page's darkest tone:
- `--surface: #05100B` → `#020806`
- `--surface-2: #0A1712` → `#050E0A`
- `--surface-3: #0F1E17` → `#0A1611`
- `--surface-border: #172922` → `#0F1F18`
- `--background` (oklch) → lower L to ~`0.11` for shadcn-based surfaces (cards, popovers) to stay consistent.

This is a token-only change and cascades to every route.

## Technical notes

- No changes to bet placement, settlement, or business logic.
- Reuse existing Supabase realtime channel in `MarketAnalyticsCard` to also invalidate the new trades query on `match_pool_transactions` INSERT.
- All ticker animation via CSS keyframes + absolutely-positioned overlay inside the chart container; no new deps.

## Files touched

- `src/styles.css` — darken surface tokens.
- `src/lib/market-history.functions.ts` — add `getRecentTrades` / `getRecentTradesPublic`.
- `src/components/matches/MarketAnalyticsCard.tsx` — volume badge, trade-print overlay, freeze-at-end logic.
- Possibly a migration for a narrow `TO anon` SELECT policy on `match_pool_transactions` (only if going public-mode).
