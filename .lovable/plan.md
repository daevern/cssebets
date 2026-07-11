## Goal

Bring back Method of Victory as a synthetic market, but keep it tightly anchored to the real bookmaker odds we already ingest, and freeze the market 30 minutes before the fight starts so we never settle on stale/late-moving prices.

## How it works

**1. Re-enable synthesis in `src/lib/ufc-odds.server.ts`**

Restore the 6-selection method block (`a_ko_tko`, `a_submission`, `a_decision`, `b_ko_tko`, `b_submission`, `b_decision`) with the same math as before, but recomputed on every odds sync so it tracks the live moneyline + distance market:

- Read fair win probs `pA`, `pB` from the current moneyline rows we just upserted.
- Read fair distance prob `pDistance` from the current total_rounds/distance rows.
- Finish share = `1 - pDistance`, split per fighter by win prob.
- KO vs Submission split per fighter from `ufc_fighters.ko_w` / `sub_w` (default 70/30).
- Apply the platform outright margin, persist to `ufc_fight_markets` as `method`, snapshot to `ufc_market_snapshots`.

Because the sync runs every 30s during the event window, the synthetic prices always reflect the latest real moneyline/distance state — never more than one sync cycle behind reality.

**2. Freeze the market 30 minutes before walk-out**

- In `runUfcOddsSync`, when `commence_time - now <= 30 min`, stop recomputing method rows for that fight and mark existing method rows `is_active = false` (or add a `locked_at` timestamp).
- In `src/lib/ufc.functions.ts` (bet placement), reject any method bet where `now >= commence_time - 30 min`. Same cutoff enforced server-side so the UI can't be bypassed.
- In `src/routes/_authenticated/ufc.$fightId.tsx`, hide method tiles (or show them disabled with "Market closed") once inside the 30-min window.

The same 30-min freeze can optionally apply to all synthetic-derived markets; the plan applies it to `method` only unless you want it broader.

**3. Transparency (small UI note)**

Add a subtle "Model-derived from live market" label on the Method tab so the market is clearly distinguished from raw bookmaker markets. No visual redesign.

**4. Settlement**

No change needed — `settle_ufc_fight_atomic` already resolves method rows by winning slot + finish bucket and refunds on draw/NC.

## What the user sees

- Method of Victory tab returns with 6 tiles on every fight that has moneyline + distance priced.
- Odds move continuously with the real market up until T-30 min, then lock.
- After T-30 the tab shows "Market closed" and no new method bets can be placed; existing bets settle normally after the fight.

## Files touched

- `src/lib/ufc-odds.server.ts` — restore synthesis; add 30-min freeze/deactivate.
- `src/lib/ufc.functions.ts` — server-side cutoff on method bet placement.
- `src/routes/_authenticated/ufc.$fightId.tsx` — Method tab visibility + "model-derived" label + closed state.

Ready to implement on approval.