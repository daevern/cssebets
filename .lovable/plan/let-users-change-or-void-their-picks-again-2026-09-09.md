# Let users change or void their picks again

Today the Picks page only lets you edit or void two kinds of tickets: the older match predictions and UFC bets. The tickets most people actually place now — football/sportsbook bets and Formula 1 bets — are shown as read-only, so a bet is final the moment it's placed. This restores stake changes and voiding for those too.

## Rules (same for every sport)

- A pick can be changed or voided only while it is still pending and the match/race has not started (kick-off in the future, event still "scheduled").
- Increase the stake: the extra amount comes out of the wallet; refused if the balance is short.
- Reduce the stake: the difference is refunded immediately. Minimum 10, maximum 50,000 points.
- Void: the whole stake is refunded and the ticket is marked void.
- Odds stay locked at the price originally taken; only the stake changes.
- Every change is written to the wallet history and the audit log, and respects the per-bet maximum payout limit.
- Free-bet and bonus-funded tickets stay locked (no partial refunds of promo money).

## What gets built

1. **Database functions** (mirroring the existing UFC ones, which already work well):
   - `edit_sports_bet_stake` / `cancel_sports_bet` for football and other sportsbook tickets.
   - `edit_f1_race_bet_stake` / `cancel_f1_race_bet` and the championship equivalents.
   - Each locks the bet row and the event row, validates ownership, pending status and lock time, adjusts the wallet atomically, writes wallet transactions plus an audit entry, and keeps the accounting journal/liability reservations consistent with how placement records them.
2. **Server functions** `src/lib/sports-bet-edit.functions.ts` and `src/lib/f1-bet-edit.functions.ts`, following the shape of `src/lib/ufc-bet-edit.functions.ts` (auth middleware, approved-member gate, friendly error messages).
3. **Picks page UI** (`src/routes/_authenticated/my-predictions.tsx`): add the existing Edit / Void control row to `SportsBetRow`, `F1BetRow` and `F1ChampBetRow`, matching the layout already used by `PredictionRow` and `UfcBetRow` — inline stake field with save/cancel, confirmation before voiding, toast feedback, and refresh of picks and wallet balance afterwards. Controls are hidden once the event locks, with a short "locked at kick-off" note.

## Technical notes

- New SQL goes in one migration; functions are `SECURITY DEFINER`, granted to `service_role` only, and called through server functions with `supabaseAdmin` after the caller's identity is verified — same pattern as the UFC pair.
- Error codes (`INSUFFICIENT_BALANCE`, `MATCH_LOCKED`, `BET_NOT_PENDING`, `INVALID_STAKE`, `MAX_PAYOUT_EXCEEDED`) are reused so the friendly-message helper can be shared.
- Cancellation sets `sports_bets.status = 'cancelled'` (and `void_reason = 'user_cancelled'`) so voided tickets are excluded from settlement runs, and releases the matching liability reservation.
- Guest/demo tickets keep working, since they run through the same wallet path.
