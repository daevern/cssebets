CREATE OR REPLACE FUNCTION public.settlement_test_cleanup(p_tag text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_match uuid;
BEGIN
  IF p_tag IS NULL OR p_tag NOT LIKE 'SETTLETEST\_%' THEN
    RAISE EXCEPTION 'settlement_test_cleanup: tag must start with SETTLETEST_';
  END IF;

  FOR v_match IN
    SELECT id FROM public.matches
     WHERE is_simulation = true AND home_team = p_tag
  LOOP
    DELETE FROM public.wallet_transactions
     WHERE reference_id IN (SELECT id FROM public.predictions WHERE match_id = v_match);
    DELETE FROM public.match_pool_transactions WHERE match_id = v_match;
    DELETE FROM public.match_stake_pools WHERE match_id = v_match;
    DELETE FROM public.settlement_journal
     WHERE reference_id = v_match
        OR reference_id IN (SELECT id FROM public.predictions WHERE match_id = v_match);
    DELETE FROM public.platform_transactions WHERE match_id = v_match;
    DELETE FROM public.predictions WHERE match_id = v_match;
    DELETE FROM public.matches WHERE id = v_match;
  END LOOP;

  DELETE FROM public.settlement_journal WHERE product LIKE 'test\_%';
END $$;

REVOKE ALL ON FUNCTION public.settlement_test_cleanup(text) FROM PUBLIC, anon, authenticated;