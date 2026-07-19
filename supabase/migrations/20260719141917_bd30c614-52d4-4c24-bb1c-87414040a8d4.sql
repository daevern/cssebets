
-- 1) Auto-suspend function
CREATE OR REPLACE FUNCTION public.close_started_f1_race_markets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH updated AS (
    UPDATE public.f1_race_markets m
       SET status = 'suspended',
           updated_at = now()
      FROM public.f1_races r
     WHERE m.race_id = r.id
       AND m.status = 'open'
       AND (r.starts_at <= now() OR r.status IN ('in_progress','finished','cancelled'))
    RETURNING m.id
  )
  SELECT count(*) INTO v_count FROM updated;
  RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.close_started_f1_race_markets() TO service_role;

-- 2) Live race state cache
CREATE TABLE IF NOT EXISTS public.f1_live_race_state (
  race_id uuid PRIMARY KEY REFERENCES public.f1_races(id) ON DELETE CASCADE,
  lap_current integer,
  lap_total integer,
  race_status text,
  fastest_lap jsonb,
  standings jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.f1_live_race_state TO authenticated;
GRANT ALL ON public.f1_live_race_state TO service_role;
ALTER TABLE public.f1_live_race_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Live race state readable by authenticated"
  ON public.f1_live_race_state FOR SELECT TO authenticated USING (true);

-- 3) Backfill current started race — Belgium is in_progress
SELECT public.close_started_f1_race_markets();

-- 4) Cron: run every minute
SELECT cron.unschedule('f1-close-started-markets') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'f1-close-started-markets'
);
SELECT cron.schedule(
  'f1-close-started-markets',
  '* * * * *',
  $$SELECT public.close_started_f1_race_markets();$$
);
