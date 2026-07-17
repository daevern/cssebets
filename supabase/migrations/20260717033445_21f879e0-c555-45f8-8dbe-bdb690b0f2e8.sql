
-- Concurrency guard lookups
CREATE INDEX IF NOT EXISTS idx_sports_sync_runs_job_status_started
  ON public.sports_sync_runs (provider, job_type, status, started_at DESC);

-- Odds freshness lookup speedup
CREATE INDEX IF NOT EXISTS idx_sports_odds_snapshots_event_fetched
  ON public.sports_odds_snapshots (sports_event_id, fetched_at DESC);

-- Odds batch picker: pick scheduled football events by time
CREATE INDEX IF NOT EXISTS idx_sports_events_sport_status_scheduled
  ON public.sports_events (sport_code, status, scheduled_at);

-- Helper: most recent run per (provider, job_type) for admin dashboard.
CREATE OR REPLACE FUNCTION public.get_recent_sports_sync_runs(_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  provider text,
  job_type text,
  sport_code text,
  competition_code text,
  status text,
  started_at timestamptz,
  finished_at timestamptz,
  records_fetched int,
  records_created int,
  records_updated int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, provider, job_type, sport_code, competition_code, status,
         started_at, finished_at, records_fetched, records_created, records_updated
  FROM public.sports_sync_runs
  WHERE sport_code = 'football' OR sport_code IS NULL
  ORDER BY started_at DESC
  LIMIT COALESCE(_limit, 20);
$$;

REVOKE ALL ON FUNCTION public.get_recent_sports_sync_runs(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_sports_sync_runs(int) TO authenticated, service_role;
