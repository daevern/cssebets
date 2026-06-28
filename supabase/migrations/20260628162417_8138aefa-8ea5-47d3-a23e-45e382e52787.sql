
CREATE OR REPLACE FUNCTION public.apifootball_consume_quota(p_requests integer DEFAULT 1)
RETURNS TABLE(allowed boolean, used integer, day_limit integer, remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'UTC')::date;
  v_used  integer;
  v_limit integer;
BEGIN
  INSERT INTO apifootball_quota(day, used, day_limit)
  VALUES (v_today, 0, 100)
  ON CONFLICT (day) DO NOTHING;

  SELECT q.used, q.day_limit INTO v_used, v_limit
    FROM apifootball_quota q
   WHERE q.day = v_today
   FOR UPDATE;

  IF v_used + p_requests > v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit, (v_limit - v_used);
    RETURN;
  END IF;

  UPDATE apifootball_quota q
     SET used = q.used + p_requests, updated_at = now()
   WHERE q.day = v_today
   RETURNING q.used, q.day_limit INTO v_used, v_limit;

  RETURN QUERY SELECT true, v_used, v_limit, (v_limit - v_used);
END;
$$;
REVOKE ALL ON FUNCTION public.apifootball_consume_quota(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apifootball_consume_quota(integer) TO service_role;
