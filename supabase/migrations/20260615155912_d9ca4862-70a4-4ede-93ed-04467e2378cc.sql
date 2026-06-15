DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.matches
    WHERE kickoff_at > now() AND reference_odds IS NOT NULL
  LOOP
    PERFORM public.regenerate_match_market_odds(r.id);
  END LOOP;
END $$;