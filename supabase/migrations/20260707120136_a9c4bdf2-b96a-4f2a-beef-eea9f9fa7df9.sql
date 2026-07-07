CREATE OR REPLACE FUNCTION public.reprice_open_match_market_odds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match record;
  v_total_updated integer := 0;
BEGIN
  FOR v_match IN
    SELECT id
      FROM public.matches
     WHERE status = 'scheduled'
  LOOP
    PERFORM public.reprice_match_reference_odds(v_match.id);
    PERFORM public.regenerate_match_market_odds(v_match.id);
    v_total_updated := v_total_updated + COALESCE(public.reprice_match_market_odds(v_match.id), 0);
  END LOOP;

  RETURN v_total_updated;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprice_open_match_market_odds() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reprice_open_match_market_odds() TO service_role;