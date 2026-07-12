# UFC auto-settle from MMA feed

The MMA feed (API-Sports MMA) reliably reports **winner** for finished fights (`status.short` = `FT` / `AFT`, plus a `winner: true` boolean per fighter), but does NOT expose **method of victory** or **finishing round** on its public endpoints. So we can auto-settle winner-only markets and leave the rest for admin.

## Behavior

Every time the existing UFC odds cron fires (already every 30s during fight windows), after odds sync we run an auto-settle pass:

1. For each `ufc_fights` row whose `status = 'scheduled'` and `commence_time < now()`, look up the fight in the MMA feed by `apimma_fight_id`.
2. If the feed reports it finished (`FT`/`AFT`), determine winner slot (`a` / `b` / `draw`).
3. Call new RPC `auto_settle_ufc_winner_atomic(fight_id, winner)` which:
   - Loops open bets on that fight
   - Settles **moneyline** and **three_way** bets (won if selection matches winner; on draw, only three_way `draw` wins; moneyline draws are voided/refunded)
   - Credits wallets for wins, writes `wallet_transactions` and `audit_log`
   - Marks fight `winner` + `settled_at = now()` but keeps `status = 'scheduled'` so admin's existing Settle button still works for method/round/total/etc.
   - Leaves method / round / total_rounds / distance / handicap bets untouched (still `open`) for admin to finalise.
4. When the admin later opens Admin → UFC and clicks Settle with method+round, the existing `settle_ufc_fight_atomic` finishes remaining open bets (its loop already filters `status='open'`, so it won't touch already-settled moneyline bets) and flips fight status to `finished`.

Admin UI stays exactly as it is; auto-settle is invisible unless you look at bet status.

## Technical

**Migration** — `auto_settle_ufc_winner_atomic(p_fight_id uuid, p_winner text)`:
- `FOR UPDATE` fight row; skip if `winner` already set (idempotent).
- Loop `ufc_bets WHERE fight_id = $1 AND status='open' AND market_type IN ('moneyline','three_way')`.
- Moneyline: `won := selection_key = p_winner`; on `p_winner='draw'` → void + refund stake.
- Three-way: `won := selection_key = p_winner` (draw is a valid selection).
- On win: credit wallet `stake * odds_locked`, insert `wallet_transactions` (kind `bet_win`), mark bet `won`.
- On loss: mark bet `lost` (stake already debited at placement).
- On void: refund stake to wallet, mark bet `void`.
- Update `ufc_fights.winner = p_winner`; keep `status='scheduled'`.
- Insert `audit_log` row with `action='ufc.auto_settle_winner'`.

**Server helper** — `src/lib/ufc-odds.server.ts`: new `runUfcAutoSettle()` that:
- Loads scheduled fights past commence_time with an `apimma_fight_id`.
- Batches MMA feed calls by date (reuse `fetchFightsByDate`), matches on `apimma_fight_id`.
- Skips fights already `winner IS NOT NULL`.
- Calls the new RPC per finished fight.
- Returns `{ checked, settledFights, settledBets }`.

**Cron hook** — extend `src/routes/api/public/hooks/ufc-odds-live.ts` to invoke `runUfcAutoSettle()` after `runUfcOddsSync()`. No new cron entry needed.

**Admin visibility** — no UI change required; the Predictions page already shows UFC bets and their status will now flip from PENDING → WON/LOST/VOID automatically for winner markets. Admin still uses the Settle button for method/round markets.

## Files touched

- `supabase/migrations/<timestamp>_ufc_auto_settle_winner.sql` (new RPC + grants)
- `src/lib/ufc-odds.server.ts` (add `runUfcAutoSettle`)
- `src/routes/api/public/hooks/ufc-odds-live.ts` (call auto-settle after odds sync)

No frontend changes.
