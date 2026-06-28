
CREATE TABLE IF NOT EXISTS public.apifootball_quota (
  day date PRIMARY KEY,
  used integer NOT NULL DEFAULT 0,
  day_limit integer NOT NULL DEFAULT 100,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.apifootball_quota TO service_role;
GRANT SELECT ON public.apifootball_quota TO authenticated;
ALTER TABLE public.apifootball_quota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read quota" ON public.apifootball_quota
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS apifootball_fixture_id integer;
CREATE INDEX IF NOT EXISTS matches_apifootball_fixture_id_idx
  ON public.matches(apifootball_fixture_id) WHERE apifootball_fixture_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.apifootball_odds_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  fixture_id integer NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  bookmaker_count integer,
  payload jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS apifootball_odds_raw_match_idx
  ON public.apifootball_odds_raw(match_id, fetched_at DESC);
GRANT ALL ON public.apifootball_odds_raw TO service_role;
GRANT SELECT ON public.apifootball_odds_raw TO authenticated;
ALTER TABLE public.apifootball_odds_raw ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read raw odds" ON public.apifootball_odds_raw
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.apifootball_consume_quota(p_requests integer DEFAULT 1)
RETURNS TABLE(allowed boolean, used integer, day_limit integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_row apifootball_quota;
BEGIN
  INSERT INTO apifootball_quota(day, used, day_limit)
  VALUES (v_today, 0, 100)
  ON CONFLICT (day) DO NOTHING;

  SELECT * INTO v_row FROM apifootball_quota WHERE day = v_today FOR UPDATE;

  IF v_row.used + p_requests > v_row.day_limit THEN
    RETURN QUERY SELECT false, v_row.used, v_row.day_limit, (v_row.day_limit - v_row.used);
    RETURN;
  END IF;

  UPDATE apifootball_quota
    SET used = used + p_requests, updated_at = now()
    WHERE day = v_today
    RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.used, v_row.day_limit, (v_row.day_limit - v_row.used);
END;
$$;

REVOKE ALL ON FUNCTION public.apifootball_consume_quota(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apifootball_consume_quota(integer) TO service_role;
