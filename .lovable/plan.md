## Cause

The error is caused by a **market-key mismatch between the UI and the DB bet-placement function**.

On the match page, the market UI loads odds from `match_market_odds` and includes a market called:

```text
1x2
```

That is the normal "Who will win in 90 minutes?" / Home-Draw-Away market shown in your screenshot.

But when the user taps it, the UI calls `placeMarketBet`, which calls the DB function:

```text
place_market_bet_atomic(..., p_market = '1x2', ...)
```

The live DB function explicitly allows many market keys, but **does not include `1x2` in its allow-list**. So it raises:

```text
MARKET_DISABLED
```

Then the frontend maps that backend error to:

```text
This market is currently disabled.
```

Your global settings are not causing it right now:

```text
bets_paused = false
correct_score_disabled = false
disabled_markets = {}
```

So the visible error is misleading: the market is not globally disabled; the UI is sending a market key that this placement function rejects.

## Secondary issue

There are also 15 markets currently marked inactive in `market_rules`, including cards/corners/exact-goals variants. Those can still appear if odds exist, because odds visibility is independent from bet availability. That can lead to similar confusion, even if it is not the main `1x2` error in the screenshot.

Inactive today:

```text
over_under_0_5, over_under_4_5, over_under_5_5, over_under_6_5,
exact_total_goals,
win_to_nil_home, win_to_nil_away,
cards_over_under_2_5, cards_over_under_5_5,
home_cards_over_under_1_5, away_cards_over_under_1_5,
first_card,
corners_over_under_8_5, corners_over_under_11_5,
first_corner
```

## Fix

### 1. Route `1x2` bets through the existing result-market placement flow

Change the match-market UI so when a user selects `1x2`, it does **not** call `place_market_bet_atomic` with `p_market = '1x2'`.

Instead, map it to the existing prediction market:

```text
1x2 UI market -> result DB market
home/draw/away -> HOME/DRAW/AWAY
```

Use `submitPrediction` / `place_bet_atomic`, which already supports `result` bets and validates the match odds server-side.

This is the correct fix because `1x2` is just the UI/provider name for the existing `result` market.

### 2. Keep non-result markets on `placeMarketBet`

All other supported market keys should continue using `placeMarketBet`:

```text
over_under_*, btts, correct_score, double_chance, cards, corners, etc.
```

### 3. Prevent unsupported/inactive markets from being clickable

Add a small availability gate before rendering/tapping selections:

- If a market key is not placeable by the correct RPC, grey it out.
- If `market_rules.is_active = false`, grey it out or hide the tab if the whole tab is unavailable.
- Keep the odds visible only if you want users to see market movement, but do not let them open a stake slip.

### 4. Improve the fallback message

Replace the generic message:

```text
This market is currently disabled.
```

with:

```text
This selection isn't accepting bets right now. Refresh to see updated markets.
```

That way if a rule changes between page load and submission, the message is less misleading.

## Files to change

- `src/components/matches/MarketTabs.tsx`
  - Detect `market === '1x2'` in submit logic.
  - Route it through `submitPrediction` with `market: 'result'`.
  - Preserve the same UI and stake slip behavior.

- `src/lib/markets.functions.ts`
  - Keep `placeMarketBet` for non-result markets.
  - Improve the `MARKET_DISABLED` user-facing error string.

- `src/lib/predictions.functions.ts`
  - Improve the same fallback error string for consistency.

Optionally, after that works:

- Add active-market filtering so inactive cards/corners/exact-goals selections are greyed out before users tap them.

## Verification

- Open a match page.
- Tap the Home/Draw/Away `1x2` selection.
- Enter stake and lock prediction.
- Expected: bet places successfully, wallet updates, no `This market is currently disabled` banner.
- Then test one non-result market like BTTS or Over/Under 2.5 to confirm the existing flow still works.