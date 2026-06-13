
CREATE OR REPLACE FUNCTION public.market_odds_cap(p_market text)
RETURNS numeric LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_market
    WHEN 'over_under_2_5'      THEN 10.0
    WHEN 'btts'                THEN 10.0
    WHEN 'exact_total_goals'   THEN 15.0
    WHEN 'half_time_full_time' THEN 20.0
    WHEN 'correct_score'       THEN 20.0
    ELSE 20.0
  END::numeric
$$;

REVOKE EXECUTE ON FUNCTION public.market_odds_cap(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.market_odds_cap(text) TO service_role;
