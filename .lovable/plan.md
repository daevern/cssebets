## Frontend-only shortlist: 36 → 22 markets

Retire 14 markets that are extreme O/U lines, duplicates, or low-signal novelties. Keep the high-margin core that drives most football-book revenue. No DB migration, no settlement code touched — historical and open tickets on retired markets still settle normally.

### Keep (22)
- **Result family**: To Qualify, Double Chance, Draw No Bet, HT/FT
- **Goals**: O/U 1.5, O/U 2.5, O/U 3.5, BTTS, Correct Score, Odd/Even, Clean Sheet Home, Clean Sheet Away
- **Cards**: Total Cards O/U 3.5, O/U 4.5, Red Card in Match
- **Corners**: Total Corners O/U 9.5, O/U 10.5, Home Corners O/U 4.5, Away Corners O/U 4.5

### Retire (14, hidden from UI)
- O/U 0.5, 4.5, 5.5, 6.5 goals
- Exact Total Goals
- Win to Nil Home / Away
- Cards O/U 2.5, 5.5; Home Cards O/U 1.5; Away Cards O/U 1.5
- Corners O/U 8.5, 11.5
- First Card, First Corner

### Changes
1. `src/lib/markets-catalog.ts` — add `ACTIVE_MARKETS` set + `isMarketActive()` helper. Types stay intact so old tickets keep their labels.
2. `src/components/matches/MarketTabs.tsx` — gate `getGroup()` with `isMarketActive`, and wrap the unconditional Exact Total Goals block in a length check so it disappears with the rest.

No DB migration, no seeder changes, no settlement-logic changes.