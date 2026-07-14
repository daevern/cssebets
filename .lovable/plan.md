## Fixes

### 1. Live trade tape only shows 8 trades (should show all recent)

**Root cause:** In `src/components/matches/LiveTradeTape.tsx`, the normalization loop caps the list at 8 items even when more trades exist:

```ts
while (filled.length < 8) {
  filled.push(list[i % list.length]);
  i += 1;
}
```

If the server returns 14 trades, the loop exits at 8. The intent was "pad up to at least 8 so the scroll column always fills", but it also truncates larger lists.

**Fix:** Change the target from `8` to `Math.max(8, list.length)` so all incoming trades are shown, and shorter lists still pad to fill the column. The server (`getRecentTrades`) already fetches up to 30 trades, so no backend change needed — the France v Spain match's 14 bets will all appear.

### 2. Add minute filter to LIVE range

In `src/components/matches/MarketAnalyticsCard.tsx`, when `range === "LIVE"` is selected, render a secondary segmented control below the LIVE/1D/1W/1M/ALL row with options: **10m · 30m · 60m · 120m**.

- Add state `liveWindowMin` (default 30m — currently hard-coded 90 seconds is way too short for real fixtures anyway; switching default to 30m is a nicer UX).
- When `range === "LIVE"`, compute `windowMs = liveWindowMin * 60_000` and use that instead of the constant `LIVE_WINDOW_SECONDS`.
- Sub-filter row only renders while LIVE is active; styled to match existing range pills.
- Persist selection in component state (no URL / storage).

### Scope

Frontend-only, two files touched:
- `src/components/matches/LiveTradeTape.tsx` — one-line fix.
- `src/components/matches/MarketAnalyticsCard.tsx` — add live minute-window state + sub-filter UI, replace the `LIVE_WINDOW_SECONDS` constant use.

No server function, DB, or RLS changes.
