-- Bump API-Football daily quota to Pro plan (7,500 req/day)
ALTER TABLE public.apifootball_quota ALTER COLUMN day_limit SET DEFAULT 7500;
UPDATE public.apifootball_quota SET day_limit = 7500 WHERE day_limit < 7500;

-- Also update the consume RPC default
CREATE OR REPLACE FUNCTION public.apifootball_consume_quota(p_requests int DEFAULT 1)
RETURNS TABLE(allowed boolean, used int, day_limit int, remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_row public.apifootball_quota%ROWTYPE;
BEGIN
  INSERT INTO public.apifootball_quota(day, used, day_limit)
  VALUES (v_today, 0, 7500)
  ON CONFLICT (day) DO NOTHING;

  SELECT * INTO v_row FROM public.apifootball_quota WHERE day = v_today FOR UPDATE;

  IF v_row.used + p_requests > v_row.day_limit THEN
    RETURN QUERY SELECT false, v_row.used, v_row.day_limit, v_row.day_limit - v_row.used;
    RETURN;
  END IF;

  UPDATE public.apifootball_quota
     SET used = used + p_requests, updated_at = now()
   WHERE day = v_today
   RETURNING * INTO v_row;

  RETURN QUERY SELECT true, v_row.used, v_row.day_limit, v_row.day_limit - v_row.used;
END;
$$;