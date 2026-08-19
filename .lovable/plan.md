# Kalshi-style market movement graph + fixing the missing history

## What's wrong today (verified)

The price-history tables that feed the World Cup graph are **completely empty**:

- `match_odds_snapshots`: 0 rows
- `market_odds_snapshots`: 0 rows

Two separate causes, both confirmed:

1. **Retention prune deletes everything older than 14 days**, including the only
   history a finished match will ever have. Once a match is settled, its tape is
   erased two weeks later and the graph goes blank forever.
2. **The 15s market heartbeat never covers World Cup matches.** It writes history
   for club football (`sports_odds_snapshots`, 55k rows), UFC (22k) and F1 (391k),
   but has no branch for the `matches` table — so even matches that finished in the
   last few days (e.g. 17–19 Aug) have zero snapshots.

## Fix 1 — never lose a finished market's shape

- Before pruning, **downsample instead of deleting** for finished events: keep one
  snapshot per 5 minutes for the last 90 days, plus the first and final point of
  each market. That preserves a readable line at a tiny fraction of the rows.
- Keep the existing 14-day full-resolution window for live/upcoming events.
- Backfill is not possible for matches whose rows were already deleted; those stay
  empty and will show the empty-state until new data accrues.

## Fix 2 — heartbeat covers World Cup matches

Add a World Cup branch to the heartbeat so `matches` rows get the same tick
treatment as football/UFC/F1: sample the current `reference_odds` for scheduled and
live matches within the window, using the same staleness ladder (20s live, 10 min
same-day, hourly further out) and the existing no-op guard so flat prices don't
create write churn.

## Fix 3 — graph styled exactly like Kalshi

Reference behaviour from the screenshots/recordings:

- Remove the legend chip row above the chart; the only labels are at the **right end
  of each line** — small muted team name on top, large bold percentage under it, in
  the series colour, with a filled end dot.
- Thinner lines (1.5px), faint dashed horizontal gridlines only, no visible x-axis
  line, no axis ticks, full-bleed to the left edge.
- One control row under the chart: **volume on the left, range tabs (1D / 1W / 1M /
  ALL) right-aligned**, active tab pure white, inactive muted grey — matching the
  current nav treatment. The LIVE tab keeps its green dot while an event is in play.
- Hover/drag scrub keeps a dashed vertical crosshair and moves the end labels to the
  hovered point (already implemented, kept).
- Tapping a label toggles that series, so users can isolate outcomes.

The same component backs World Cup, football, F1 and UFC, so the restyle lands
everywhere at once.

## Technical notes

- Chart: `src/components/matches/MarketAnalyticsCard.tsx` (recharts `LineChart` +
  `Customized` end-label layer).
- Heartbeat: `runMarketHeartbeat` in `src/lib/odds-live.server.ts`.
- Retention: new migration replacing the delete-only prune in
  `20260819013000_cloud_io_retention_cron_indexes.sql` with a downsampling prune,
  keeping the existing hourly cron cadence.
