## Why the Method tab isn't showing

The Method tab is coded and would render as soon as any `market_type = 'method'` rows exist for the fight. For this fight there are **zero** method rows in the DB:

```
three_way    3     moneyline    2
handicap     2     total_rounds 8
distance     2     round        5
```

Reason: API-Sports MMA for this event doesn't expose the per-fighter method bet IDs (13–20) or a name-based "Method of Victory" market from any bookmaker in the feed, so the parser has nothing to store. The Method tab is then hidden because `availableTypes` doesn't include it.

Bonus problem visible in the same query: `three_way` and `handicap` rows are still active even though we agreed to retire them.

## Fix

1. **Synthesize a Method of Victory market when the feed doesn't provide one** (`src/lib/ufc-odds.server.ts`)
   - Compute fair win probability `pA`, `pB` from moneyline (already done for margin).
   - Compute `pDistance` from the derived `distance` market (already computed for total_rounds).
   - Finish share `pFinish = 1 - pDistance`. Split per fighter proportional to their win prob: `pA_finish = pFinish * pA`, `pB_finish = pFinish * pB`. Decision share: `pA_dec = pDistance * pA`, `pB_dec = pDistance * pB`.
   - Split each fighter's finish into KO/TKO vs Submission using their career finish mix from `ufc_fighters` (`ko_w`, `sub_w`; default 70/30 if unknown).
   - Convert the 6 probabilities to fair odds, apply `applyOutrightMargin` with the platform's method margin (reuse the outright margin setting), and persist as 6 `method` rows: `a_ko_tko`, `a_submission`, `a_decision`, `b_ko_tko`, `b_submission`, `b_decision`.
   - Only synthesize when moneyline + distance are both priced. If the real feed later provides explicit method prices, those win (parsed prices are kept as-is, synthesis skipped).
   - Snapshot the synthesized prices to `ufc_market_snapshots` so movement charting works.

2. **Actually deactivate retired markets**
   - After the upsert block, run the deactivation for `three_way` and `handicap` unconditionally (the previous change wasn't taking effect for existing rows — confirmed by the DB count above). Also deactivate any `total_rounds` rows whose selection isn't in the kept set.

3. **Label + Draw handling in UI** (`src/routes/_authenticated/ufc.$fightId.tsx`)
   - Method tab already renders these 6 keys. Add a small selection-label map so tiles read as "Holloway by KO/TKO", "McGregor by Decision", etc., using the fight's fighter names.
   - Draw as a 7th selection is skipped for now — API-Sports doesn't quote a method-draw price and the synthesis has no defensible way to price it. Draws in MMA are ~0.5% and are handled as void/refund by settlement.

4. **Settlement (`settle_ufc_fight_atomic`)** — already resolves `method` rows by matching winning slot + finish bucket, and refunds on draw/NC. No change required.

## What the user sees after this

- The Method tab appears on every fight that has moneyline + distance priced (i.e. essentially every card), with 6 selectable tiles.
- The stale "Who wins the fight result?" (three-way) and "Who covers the handicap?" tabs disappear from the current fight and stay gone.

Ready to implement on approval.