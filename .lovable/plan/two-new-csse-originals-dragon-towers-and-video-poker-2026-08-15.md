# Two new CSSE Originals: Dragon Towers and Video Poker

Both games fit the existing "mini games" framework that already powers Hi-Lo, Dice, Fortune Wheel, Keno and Crash. That means no new engine, no new accounting layer, no new admin plumbing from scratch — we reuse what is already built and tested, which keeps credit usage low.

## What the player gets

**Dragon Towers** (Stake-style)
- A tower of rows (default 8). Each row has a set number of tiles, one or more of which is a "dragon" (loss).
- Pick a tile per row to climb; each safe pick raises the running multiplier. Cash out any time; hit a dragon and the round ends.
- Difficulty selector: Easy (4 tiles, 1 dragon), Medium (3 tiles, 1 dragon), Hard (2 tiles, 1 dragon), Nightmare (4 tiles, 3 dragons) — same 96% target RTP as the other cabinets.
- Reveals the full tower on loss, exactly like Stake.

**Video Poker** (Jacks or Better)
- 5 cards dealt, player holds any subset, one draw, paid on the published paytable (Jacks or Better through Royal Flush).
- Standard 9/6 style paytable tuned to the house's 96% target RTP.
- Hold toggles, animated draw, hand-name callout on settle.

Both get the same treatment as the newest cabinets: slate/neon console shell, `MiniCabinetTitle`, `ControlDock` stake bar, sound variants, animated balance, result dialog, recent-results strip, and a provably-fair verify dialog.

## Reused assets (why this is cheap)

| Need | Existing piece reused |
|---|---|
| Round lifecycle, stake debit, settlement, wallet | `arcade_mini_rounds` + existing mini RPC pattern |
| Accounting / house margin | `accounting_post_arcade_settlement` (add two products to allowlist) |
| Capacity + liability reservation | `accounting_migration_flags` rows, same as Keno/Crash |
| Provable fairness | existing server-seed commit/reveal used by Hi-Lo and Crash |
| Client API | `mini.functions.ts` (extend the product enum, add 4 server fns) |
| Cards UI | `PlayingCard.tsx` from Blackjack |
| Tile/grid UI | `TreasureTile.tsx` / `TreasureGrid.tsx` patterns |
| Stake bar, sounds, themes, lobby tiles | `ControlDock`, `sound.ts`, `theme.ts`, `MiniGameArt` |
| Verify dialog | `MiniVerifyDialog.tsx` |

Only two new board components are actually written from scratch: `TowersBoard.tsx` and `PokerBoard.tsx`.

## Backend work

One migration adding:
- `arcade_mini_configs` rows for `towers` and `poker` (min/max stake, chip values, target RTP, max multiplier, daily round limit, maintenance flag, payload with difficulty tables / paytable).
- House accounts (STAKE, PAYOUT, RESERVE) for both products in PRODUCTION and SIMULATION.
- `accounting_migration_flags` rows with journal + capacity enforcement enabled.
- `accounting_post_arcade_settlement` allowlist extended to `towers` and `poker`.
- SECURITY DEFINER RPCs, mirroring the Hi-Lo/Crash pattern:
  - `arcade_towers_start`, `arcade_towers_pick`, `arcade_towers_cashout`
  - `arcade_poker_deal`, `arcade_poker_draw`
- All outcomes derived server-side from a committed seed; the browser may only send stake, selection, client seed and idempotency key. No client-supplied card, tile, multiplier or payout is ever accepted.
- Payout capacity checked before any round is accepted, so a Royal Flush or a full tower climb can never exceed the reserve.

## Maths (published, mirrored client-side)

Extend `src/lib/arcade/mini-math.ts` with:
- Towers: per-row survival probability, step multiplier = `RTP^(1/rows) / p_safe`, cumulative ladder, max multiplier cap per difficulty.
- Poker: hand evaluator + paytable, expected return computed against optimal-hold play so the published RTP is provable.

Vitest suites under `src/lib/arcade/__tests__/` assert both games land on the published RTP (Monte Carlo for Towers, exhaustive/optimal-play check for Poker) and that no path exceeds the max multiplier.

## Admin / management side

The arcade control centre at `/management/admin/arcade` currently only lists the five legacy games. This work extends it to cover **all** mini products (Hi-Lo, Dice, Wheel, Keno, Crash) plus the two new ones, so nothing is invisible:
- Per-game live tiles: players in play, open rounds, stake at risk, gross win/loss, house margin vs published RTP for 24h / 7d / 30d.
- Round explorer: who played, stake, selection, outcome, multiplier, payout, settlement time, with a link to the fairness proof for any round.
- Risk controls per game: min/max stake, chip values, max multiplier cap, daily round limit, maintenance mode and announcement banner — published as a new config version (draft → active) so changes are versioned and auditable, never edited in place.
- Towers-specific: enable/disable each difficulty. Poker-specific: paytable editing with a live RTP readout that blocks publishing above target.

## Files

New: `TowersBoard.tsx`, `PokerBoard.tsx`, `arcade.towers.tsx`, `arcade.poker.tsx`, two lobby tiles, poker hand-evaluator module, tests.
Edited: `mini-math.ts`, `mini.functions.ts`, `mini.server.ts`, `sound.ts`, `theme.ts`, `arcade.index.tsx`, `HowToPlayDialog`, `arcade-admin.functions.ts`, `admin.arcade.tsx`.

## Rollout

Both games ship in maintenance mode with capacity enforcement on, verified against the accounting self-test, then flipped live once the RTP tests and a live smoke round both pass.
