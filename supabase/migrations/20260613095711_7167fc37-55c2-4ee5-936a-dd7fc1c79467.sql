CREATE INDEX IF NOT EXISTS idx_predictions_pending_by_match
  ON public.predictions (match_id)
  WHERE status = 'pending'::public.prediction_status;

CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid,
  p_home int,
  p_away int,
  p_home_ht int DEFAULT NULL,
  p_away_ht int DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_a int := 0;
  v_b int := 0;
  v_locked boolean := false;
  v_has_pending boolean := false;
BEGIN
  -- Prevent concurrent refreshes from waiting on the same match settlement.
  SELECT pg_try_advisory_xact_lock(hashtext('settle_match_all_markets_atomic'), hashtext(p_match_id::text))
    INTO v_locked;

  IF NOT v_locked THEN
    RETURN 0;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.predictions
    WHERE match_id = p_match_id
      AND status = 'pending'::public.prediction_status
  ) INTO v_has_pending;

  IF NOT v_has_pending THEN
    IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
      UPDATE public.matches
        SET home_score_ht = COALESCE(home_score_ht, p_home_ht),
            away_score_ht = COALESCE(away_score_ht, p_away_ht)
        WHERE id = p_match_id;
    END IF;
    RETURN 0;
  END IF;

  -- Persist HT score if provided and not already stored.
  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    UPDATE public.matches
      SET home_score_ht = COALESCE(home_score_ht, p_home_ht),
          away_score_ht = COALESCE(away_score_ht, p_away_ht)
      WHERE id = p_match_id;
  END IF;

  SELECT public.settle_match_atomic(p_match_id, p_home, p_away) INTO v_a;
  SELECT public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht) INTO v_b;
  RETURN COALESCE(v_a,0) + COALESCE(v_b,0);
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match_all_markets_atomic(uuid, int, int, int, int) TO service_role;