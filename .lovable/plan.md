## Plan: fix Market Movement so it feels live and reflects global market odds

### What will change
1. **Make the graph use global bookmaker odds as the source**
   - Treat API-Football bookmaker odds as the “world market” signal.
   - The chart will no longer imply it is based on CSSEBets users’ trades/bets.
   - Update the label/copy to something like **World market movement** or **Global odds movement** so users understand it is external market consensus.

2. **Fix the 80h stale problem**
   - The current graph reads from stored odds snapshots. If the latest stored snapshot is 80h old, the UI can only carry that old point forward.
   - Update the odds sync path so upcoming/open matches refresh **Match Result / Home-Draw-Away** frequently enough and insert fresh snapshots into `match_odds_snapshots`.
   - Make the chart prefer `match_result` by default, because that is the main global 90-minute market and the one users care about most.

3. **Add a near-live sync tier for active betting windows**
   - For matches within the next 48 hours: refresh global odds on a tighter schedule than the old stale window.
   - For matches very close to kickoff: refresh even more aggressively, while respecting the API quota guard.
   - This gives the database fresh global market snapshots instead of showing an 80h-old point.

4. **Make the graph visibly move every second**
   - Keep the 1H range as the default.
   - Every second, append a temporary “now” point using the latest known global odds/probability.
   - The line/x-axis will advance every second like Kalshi.
   - Important: the price/probability only changes when the external bookmaker odds actually change; between real updates, the graph will tick forward with the latest value rather than invent fake price movement.

5. **Improve the chart when only one recent snapshot exists**
   - If there is just one real snapshot in the last hour, create a short carried-forward baseline so the user sees an actual horizontal live line instead of only dots/labels.
   - Keep the latest point pulsing and update the “updated” badge based on the latest real external snapshot.

6. **Add realtime invalidation for fresh odds snapshots**
   - When a new `match_odds_snapshots` or `market_odds_snapshots` row lands, invalidate the chart query and redraw from the fresh server data.
   - Keep the client-side 1-second ticker separate from the real snapshot stream.

7. **Make stale data transparent**
   - If global odds are fresh, show **Live market · updated seconds ago**.
   - If the external provider has not changed/synced recently, show **Delayed market · updated X ago**.
   - This avoids pretending there are real second-by-second price changes if the provider is not sending new prices every second.

### Technical details
- Update `src/components/matches/MarketAnalyticsCard.tsx`:
  - Default to 1H and force Match Result as the primary market when available.
  - Build a per-second live tail from the latest real snapshot.
  - Create a visible line even if the 1H window only has one real point.
  - Update labels from internal market language to external/global market language.

- Update `src/lib/market-history.functions.ts`:
  - Prefer `match_result` when available.
  - Return enough metadata for the UI to know whether data is fresh or delayed.
  - Ensure the last real snapshot timestamp comes from the latest global odds row.

- Update the API-Football sync layer:
  - Tighten freshness rules for upcoming matches so Match Result odds are not left stale for days.
  - Keep quota protection in place.
  - Continue storing snapshots for auditability and graph history.

- If needed, add or adjust a scheduled backend hook for near-kickoff odds refresh.

### Important limitation
API-Football provides bookmaker odds, not actual worldwide bet-by-bet trade flow. I can make the graph update visually every second and refresh external odds frequently, but I should not fabricate “people are betting every second” data unless we connect a provider that supplies real betting volume/order-flow data.