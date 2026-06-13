CREATE OR REPLACE FUNCTION public.market_odds_cap(p_market text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE p_market
    WHEN 'half_time_full_time' THEN 20.0
    WHEN 'correct_score'       THEN 100.0
    ELSE 20.0
  END::numeric
$$;

REVOKE EXECUTE ON FUNCTION public.market_odds_cap(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.market_odds_cap(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.staff_approve_point_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_approve_point_request(uuid, uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.staff_reject_point_request(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.staff_reject_point_request(uuid, uuid, text) TO service_role;