CREATE OR REPLACE FUNCTION public.apifootball_consume_quota(p_requests int DEFAULT 1)
RETURNS TABLE(allowed boolean, used int, day_limit int, remaining int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_used int;
  v_limit int;
BEGIN
  INSERT INTO public.apifootball_quota(day, used, day_limit)
  VALUES (v_today, 0, 7500)
  ON CONFLICT (day) DO NOTHING;

  SELECT q.used, q.day_limit INTO v_used, v_limit
    FROM public.apifootball_quota q
   WHERE q.day = v_today
   FOR UPDATE;

  IF v_used + p_requests > v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit, v_limit - v_used;
    RETURN;
  END IF;

  UPDATE public.apifootball_quota
     SET used = used + p_requests, updated_at = now()
   WHERE day = v_today
   RETURNING apifootball_quota.used, apifootball_quota.day_limit
        INTO v_used, v_limit;

  RETURN QUERY SELECT true, v_used, v_limit, v_limit - v_used;
END;
$$;