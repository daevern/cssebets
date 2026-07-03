
# Free-bet: hardening, bankroll accounting, and in-match UX

Three changes, no impact on regular bets.

## 1. Restrict free bets to 90-min 1X2 (server-side)

- `src/lib/freebets.functions.ts`: tighten `PlaceSchema` to
  - `market: z.literal("result")`
  - `outcome: z.enum(["HOME","DRAW","AWAY"])`
- Add a matching guard inside `place_free_bet_atomic` RPC — reject anything other than `market='result'` and outcome in HOME/DRAW/AWAY, so a direct SQL/RPC call can't bypass the client.

## 2. Correct free-bet economics (bankroll funds it, profit-only payout)

Current flow:
- Store purchase (`redeem_free_bet`): debits tokens, mints `csse_free_bets` row. **Does NOT touch bankroll.**
- Placement (`place_free_bet_atomic`): records prediction with `virtual_stake = stake`, `potential_return = stake * odds`, flags `free_bet_id`. Records a best-effort platform txn for "stake issued".
- Settlement (`settle_match_atomic`): pays out full `potential_return = stake * odds` on win, regardless of free-bet flag.

Desired flow (per your rules):

```text
Store purchase:      bankroll  -= stake   (bankroll funds the free bet up-front)
                     tokens    -= price
                     issue csse_free_bets row (status=available)

Placement:           no wallet or bankroll movement
                     prediction.free_bet_id = <id>
                     prediction.potential_return = stake * (odds - 1)   (profit only)

Settle WIN:          user wallet += stake * (odds - 1)      (profit only)
                     bankroll   += stake                    (stake refunded to house)
                     bankroll   -= stake * (odds - 1)       (profit paid out)
                     → net bankroll delta on win = -profit

Settle LOSS:         user wallet unchanged
                     bankroll   += stake                    (stake refunded to house)
                     → net bankroll delta on loss = 0
                                                (already paid -stake at purchase)

Settle VOID:         bankroll   += stake                    (stake refunded)
                     free_bet row → status='refunded' (re-usable? — see Q)
```

Net effect matches your example: 10-pt free bet on 2.0 odds → win pays user 10 profit; bankroll ends -10 for the win case; 0 for the loss case; the 10-pt "cost" was already booked when the free bet was issued.

Implementation:
- Migration to update `redeem_free_bet`: also debit bankroll via `platform_apply_change('free_bet_issued', -stake, ...)`. Add the txn type if it doesn't exist.
- Migration to update `place_free_bet_atomic`: set `potential_return = stake * (odds - 1)` (profit only) when it's a free bet. Remove the misleading "stake_collected" platform txn (nothing was collected — bankroll was debited at issue, not at placement).
- Migration to update `settle_match_atomic` win branch: when `v_pred.free_bet_id IS NOT NULL`, credit the user only `stake*(odds-1)` and record two platform txns: `+stake` (stake refunded) and `-profit` (payout paid). On loss branch: `+stake` back to bankroll. Same treatment in `settle_new_markets_for_match` — but since free bets are restricted to `result` only, only the `settle_match_atomic` result branch needs it in practice.
- Update `void_match_atomic` free-bet handling: refund bankroll by stake, mark free bet as `refunded`.

## 3. In-match "use your free bet" prompt

New behaviour on `src/routes/_authenticated/matches.$matchId.tsx`:

- Fetch `listMyFreeBets()` alongside match data.
- If user has ≥1 available free bet AND the tab is the 1X2 / result market: show a persistent banner at the top of the market panel: **"You have N free bet(s) — 10 pt. Use one on this match?"** with a **[Use free bet]** button.
- When active:
  - Stake input becomes read-only, locked to `freeBet.stake_amount`.
  - Header changes to "Free bet: 10 pt (fixed)".
  - On confirm, calls `placeFreeBet` (existing server fn), not `placeBet`.
  - Only H/D/A buttons are enabled; other market tabs get disabled with tooltip "Free bets are for match result (1X2) only".
- A subtle **[Cancel free bet]** link exits back to a regular bet.
- Remove the dedicated `/free-bets/place` page from the bottom nav (route can stay as a fallback) — the placement flow now lives where users actually place bets.

## Files touched

- `supabase migration` (single migration): update `redeem_free_bet`, `place_free_bet_atomic`, `settle_match_atomic`, `void_match_atomic`.
- `src/lib/freebets.functions.ts` — tighten schema.
- `src/routes/_authenticated/matches.$matchId.tsx` — banner + locked-stake state + branch to `placeFreeBet`.
- (Optional) `src/components/nav/BottomNav.tsx` — hide "Free bets" tab.

## Open questions (I need answers before I code)

1. **Void policy**: on match void, refund the free bet to `status='available'` (re-usable) or refund to bankroll and burn the free bet? I'll default to *refund + re-usable* so the user isn't penalised — confirm.
2. **Existing settled free bets**: are there any already-settled or currently-pending free bets in prod I need to backfill/reconcile? (I saw `predictions.free_bet_id` exists but haven't queried counts.)
3. **Confirm 10-pt store item**: the change applies to any free-bet stake; is 10 pts the only tier right now, or should I keep the store flexible for future 20/50-pt tiers? (I'll keep it flexible either way.)

Once you confirm the void policy (Q1), I'll ship all four edits + the migration in one turn, then re-run the audit and publish.
