-- Phase 1.5 A: settlement audit + odds freshness + halftime scores (football / sports_ system only)

ALTER TABLE public.sports_events
  ADD COLUMN IF NOT EXISTS ht_home_score INTEGER,
  ADD COLUMN IF NOT EXISTS ht_away_score INTEGER;

ALTER TABLE public.sports_markets
  ADD COLUMN IF NOT EXISTS provider_odds_ts TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_odds_update_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_after_seconds INTEGER NOT NULL DEFAULT 600,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
  ADD COLUMN IF NOT EXISTS settlement_reason TEXT,
  ADD COLUMN IF NOT EXISTS winning_selection_keys TEXT[],
  ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE INDEX IF NOT EXISTS sports_markets_event_status_idx
  ON public.sports_markets (sports_event_id, status);

CREATE INDEX IF NOT EXISTS sports_markets_freshness_idx
  ON public.sports_markets (last_odds_update_at)
  WHERE status = 'open';

-- Odds snapshots: prevent exact-duplicate rapid-fire inserts (dedupe)
CREATE UNIQUE INDEX IF NOT EXISTS sports_odds_snapshots_dedupe_idx
  ON public.sports_odds_snapshots (sports_market_id, selection_key, provider_ts, decimal_odds);
