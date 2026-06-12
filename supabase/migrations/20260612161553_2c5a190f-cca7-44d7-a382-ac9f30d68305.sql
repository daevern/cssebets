DO $$
DECLARE r record; v_err text;
BEGIN
  FOR r IN SELECT id FROM public.matches WHERE status='scheduled' AND kickoff_at > now() LOOP
    BEGIN
      PERFORM public.seed_match_market_odds(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'match % failed: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;