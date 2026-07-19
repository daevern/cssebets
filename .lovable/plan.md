
## Goal

Make UFC self-managing like Football and F1. Today, `runUfcOddsSync` only runs against a `ufc_events` row that an admin has to insert and flip `is_active=true`, plus set the correct `starts_at`. We'll add automatic event discovery so the next upcoming UFC card is always live in the app with its full main + co-main + prelims, and finished events get retired without manual work.

## What to build

### 1. New `runUfcEventDiscovery()` in `src/lib/ufc-odds.server.ts`
- Scan API-MMA `/fights` for each of the next 21 days (batched, with the existing quota-friendly patterns).
- Group returned fights by `slug` prefix (event title before `:`), producing one candidate event per unique UFC card, with the earliest-timestamp fight as `starts_at`.
- Upsert into `ufc_events` keyed on a stable `event_key` derived from the slug (slugified, e.g. `ufc-fight-night-usman-vs-du-plessis`). Fields: `name` from slug, `starts_at` from earliest fight.
- Activation rule: exactly one row has `is_active=true` — the event whose `starts_at` is the soonest that hasn't ended yet (event ends 6h after `starts_at`). All others → `is_active=false`.
- Return `{ discovered, activated }` for logging.

### 2. Wire discovery into the existing cron
- Update `src/routes/api/public/hooks/ufc-odds-live.ts` to call `runUfcEventDiscovery()` before `runUfcOddsSync()` / `runUfcAutoSettle()`.
- Discovery only needs to run occasionally: gate it to run once per ~30 min (compare against last `audit_log` entry `ufc.event_discovery` or a simple in-memory throttle by wall-clock minute).

### 3. Adjust `runUfcOddsSync` window
- Current cost guard skips API calls when `|now - starts_at| > 3 days`. Keep that, but since discovery now runs upstream, this stays as-is — no change needed beyond the discovery call preceding it.

### 4. Retire the manual admin flow (soft)
- Admin UFC page (`src/routes/management/admin.ufc.tsx`) currently exposes create/edit/activate for `ufc_events`. Leave the page working (useful as an override) but add a small banner: "Events auto-discover from API-MMA every 30 minutes. Manual override still available."

### 5. Backfill on deploy
- Run `runUfcEventDiscovery()` once via `supabase--insert` won't work (it's app code) — trigger via the cron on next tick. No SQL migration required; `ufc_events` schema already fits.

## Technical details

- API-MMA quota: fetching 21 days = 21 `/fights?date=` calls. On the paid plan this is well within limits. Cache results in-memory during a single discovery run to avoid double-fetching for `runUfcOddsSync`.
- Event end heuristic: `starts_at + 6h < now()` → considered finished (a UFC card rarely exceeds 6h from first prelim to main event walkout).
- `event_key` generation: `slug.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,80)`.
- No DB migration needed. All schema is in place.

## Out of scope

- Changing settlement logic.
- Removing the admin override UI entirely.
- UI changes on `/ufc` page (already renders whichever event is `is_active`).

## Files to change

- `src/lib/ufc-odds.server.ts` — add `runUfcEventDiscovery()`.
- `src/routes/api/public/hooks/ufc-odds-live.ts` — call discovery before existing sync/settle steps.
- `src/routes/management/admin.ufc.tsx` — small banner noting auto-discovery.
