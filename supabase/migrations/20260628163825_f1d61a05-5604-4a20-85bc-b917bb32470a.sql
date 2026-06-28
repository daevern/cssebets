DROP FUNCTION IF EXISTS public.apifootball_consume_quota(int);

CREATE FUNCTION public.apifootball_consume_quota(p_requests int DEFAULT 1)
RETURNS TABLE(out_allowed boolean, out_used int, out_day_limit int, out_remaining int)
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
    out_allowed := false;
    out_used := v_used;
    out_day_limit := v_limit;
    out_remaining := v_limit - v_used;
    RETURN NEXT;
    RETURN;
  END IF;

  UPDATE public.apifootball_quota q
     SET used = q.used + p_requests, updated_at = now()
   WHERE q.day = v_today
   RETURNING q.used, q.day_limit INTO v_used, v_limit;

  out_allowed := true;
  out_used := v_used;
  out_day_limit := v_limit;
  out_remaining := v_limit - v_used;
  RETURN NEXT;
END;
$$;