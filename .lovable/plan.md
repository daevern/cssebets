# Make UFC automatic like Football, F1 and World Cup

## Why UFC needs manual work today

Two separate problems, both confirmed in the code and the live data.

**1. The scheduled UFC jobs are being rejected.**
The two UFC cron jobs fire every minute, but the platform is answering them with
`unauthorized` (the cron secret stored in the job doesn't match what the published
site expects). Evidence: the last automatic UFC event discovery recorded in the audit
log is **6 Aug**, the last automatic odds sync is **10 Aug**, and the response log is
full of `401 unauthorized` replies. So since then nothing has been picked up unless an
admin pressed sync by hand.

**2. UFC was built as a "one event at a time" product; football/F1 were not.**
- Only one row in the events table can be `is_active`, and the sync only ever works on
  that single event. Football syncs every fixture across every enabled league; F1 syncs
  the whole season.
- Discovery only scans 21 days ahead, then deactivates every other card. When the active
  card finishes and discovery isn't running, the whole UFC section goes empty — which is
  exactly the current state (the active row is `UFC Fight Night`, 9 Aug, already over).
- Odds sync is skipped entirely unless the event is within ±5 days.
- Discovery is throttled by an in-memory timer that resets whenever the server restarts,
  so it runs unpredictably.
- The user-facing UFC page reads only the single active event, so even cards already in
  the database stay invisible.

## Size of the change

Medium — roughly one server file plus the cron wiring. No UX redesign, no odds-math
change, no new tables. The fight/odds/settlement logic already written for one event is
reused as-is; it just gets driven per event instead of per "the active event".

## What will be done

**Fix delivery (small)**
- Re-issue the cron secret and rewrite all scheduled hook jobs with the correct value so
  UFC (and every other feed job currently getting rejected) is accepted again.
- Split UFC into three jobs matching the football pattern instead of one combined job:
  discovery (every 30 min), odds refresh (every 5 min, tightening near fight time),
  settlement (every 2 min).

**Make UFC multi-event (main work)**
- Discovery scans a rolling ~45-day window, upserts every UFC card it finds, and stops
  deactivating other events. "Active" becomes "not finished yet" rather than a single row.
- Odds sync loops over every upcoming card instead of one, with a per-event budget so the
  nearest card is refreshed most often and far-out cards less often (same freshness
  approach football uses). Removes the ±5 day hard skip.
- Auto-settle runs across all recent events, not just the active one.
- Replace the in-memory throttle with a database-recorded last-run timestamp so timing is
  reliable across restarts.
- Cancelled/removed bouts get their markets closed automatically rather than left open.

**Reads and admin**
- The UFC landing page shows the next upcoming card automatically (soonest card that
  hasn't finished), and "all fights" lists every upcoming card grouped by event.
- Admin UFC screen keeps its manual buttons as a fallback and gains a per-event status
  line (last synced, fights loaded, markets open) so it's obvious when the feed is behind.

## Technical notes

- Files: `src/lib/ufc-odds.server.ts` (discovery/odds/settle loops), `src/lib/ufc.functions.ts`
  (event selection for reads), new hook routes `ufc-discovery` / `ufc-odds` / `ufc-settle`
  under `src/routes/api/public/hooks/`, and `src/routes/management/admin.ufc.tsx` for status.
- Migration: cron job re-creation, plus a small `ufc_events` sync-bookkeeping column
  (`last_synced_at`) and an index on `starts_at`.
- Feed quota: discovery is date-based (one call per day scanned), so the window widening is
  offset by running it every 30 min instead of every tick and by skipping past dates.

## Verification

- Confirm the hooks return `200` from the scheduler (response log), and that new
  `ufc.event_discovery` / `ufc.odds_sync` audit rows appear within minutes.
- Confirm multiple upcoming UFC cards appear with odds without any admin action.
- Confirm a finished fight settles automatically and bets pay out.
