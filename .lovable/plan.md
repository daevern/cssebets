## Why users see "This market is currently disabled"

The banner is thrown by the DB whenever a bet-placement RPC (`place_bet_atomic`, `place_market_bet_atomic`, `place_new_market_bet_atomic`, `place_cards_corners_bet_atomic`) raises `MARKET_DISABLED`. The frontend maps that error to the single string users see. There is no other code path that produces this exact message.

There are **four independent reasons** the DB raises `MARKET_DISABLED`. On your project I checked live settings and only reason 4 is currently firing.

### 1. Global admin kill-switch (not active today)
`platform_settings.disabled_markets` is a text array (Admin → Risk Settings). If the market key is in that array, every bet on it is refused.
- Current value: `[]` — nothing globally disabled.

### 2. Correct Score kill-switch (not active today)
`platform_settings.correct_score_disabled = true` blocks only the `correct_score` market.
- Current value: `false`.

### 3. Market not in the RPC's hardcoded allow-list
Each atomic RPC only accepts a fixed set of `market` strings. If the client sends a market key the specific RPC wasn't written to handle, it raises `MARKET_DISABLED`. Examples:
- `place_market_bet_atomic` accepts only: `over_under_2_5`, `btts`, `correct_score`, `half_time_full_time`, `exact_total_goals`, `to_qualify`.
- `place_new_market_bet_atomic` accepts a different set (clean sheet / win to nil / etc.).
- `place_cards_corners_bet_atomic` accepts only cards / corners / first_corner keys.
Symptom: bets on the "right" tab work; bets on a specific sub-market fail because the client routed them to the wrong RPC.

### 4. Per-market disable in `market_rules.is_active = false` (this is what your users are hitting)
Any market row with `is_active = false` in `market_rules` is treated as disabled. Currently OFF on your DB:

```
over_under_0_5, over_under_4_5, over_under_5_5, over_under_6_5,
exact_total_goals,
win_to_nil_home, win_to_nil_away,
cards_over_under_2_5, cards_over_under_5_5,
home_cards_over_under_1_5, away_cards_over_under_1_5, first_card,
corners_over_under_8_5, corners_over_under_11_5, first_corner
```

So a user who taps any Goals/Cards/Corners selection tied to those keys, or a specials selection using those keys, will see the banner even though the odds render on screen (odds come from `match_market_odds` / provider snapshots, which are independent of `market_rules.is_active`). That mismatch — odds visible but rule inactive — is why it feels random and match-specific: whichever match happens to expose a card/corner/exact-goals selection triggers it.

Your screenshot (in-play, "Cards / Corners / Specials" tabs visible, banner on top) matches this exactly.

### How to confirm per report
Ask the user which tab + selection they tapped, then run:
```sql
SELECT market_key, is_active
FROM market_rules
WHERE market_key = '<the market key>';
```
If `is_active = false`, that's reason 4. If the key isn't listed at all, it's reason 3 (client sending an unsupported key).

### Nothing to build
This plan is diagnostic only — no code/DB changes are proposed. Pick one of the follow-ups if you want a fix:
- Flip specific `market_rules.is_active` to `true` for the markets you want live.
- Hide any selection whose `market_rules.is_active = false` from the UI so users never see the banner.
- Split the error message per reason (global pause vs per-market rule vs unsupported key) so users get a clearer explanation.