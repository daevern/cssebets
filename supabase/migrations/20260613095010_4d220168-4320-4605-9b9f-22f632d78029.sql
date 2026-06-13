CREATE OR REPLACE FUNCTION public.adjust_correct_score_odds(
  p_match_id uuid,
  p_target_overround numeric DEFAULT 1.25,
  p_max_odds numeric DEFAULT 100.0
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_raw_total numeric := 0;
  v_implied numeric;
  v_capped_sum numeric;
  v_uncapped_sum numeric;
  v_residual numeric;
  v_scale numeric;
  v_iter int;
  v_any boolean := false;
BEGIN
  CREATE TEMP TABLE _cs(
    selection text PRIMARY KEY,
    prob numeric,
    odds numeric,
    capped boolean
  ) ON COMMIT DROP;

  FOR r IN
    SELECT selection, odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = 'correct_score' AND active = true
  LOOP
    IF r.odds IS NULL OR r.odds < 1.01 THEN CONTINUE; END IF;
    v_implied := 1.0 / r.odds;
    v_raw_total := v_raw_total + v_implied;
    INSERT INTO _cs(selection, prob, odds, capped)
      VALUES (r.selection, v_implied, NULL, false);
    v_any := true;
  END LOOP;

  IF NOT v_any OR v_raw_total <= 0 THEN
    DROP TABLE _cs;
    RETURN;
  END IF;

  UPDATE _cs SET prob = prob / v_raw_total;

  UPDATE _cs
     SET capped = (1.0 / (prob * p_target_overround)) >= p_max_odds,
         odds = LEAST(p_max_odds, 1.0 / (prob * p_target_overround));

  FOR v_iter IN 1..10 LOOP
    SELECT
      COALESCE(SUM(CASE WHEN capped THEN 1.0/odds ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN NOT capped THEN 1.0/odds ELSE 0 END), 0)
      INTO v_capped_sum, v_uncapped_sum
      FROM _cs;

    v_residual := p_target_overround - v_capped_sum;
    EXIT WHEN v_residual <= 0 OR v_uncapped_sum <= 0;

    v_scale := v_residual / v_uncapped_sum;
    EXIT WHEN abs(v_scale - 1.0) < 0.0005;

    UPDATE _cs
       SET odds = LEAST(p_max_odds, odds / v_scale),
           capped = capped OR (odds / v_scale) >= p_max_odds
     WHERE NOT capped;
  END LOOP;

  UPDATE public.match_market_odds m
     SET odds = ROUND(GREATEST(1.05, c.odds)::numeric, 2),
         source = 'derived_poisson_adjusted',
         updated_at = now()
    FROM _cs c
   WHERE m.match_id = p_match_id
     AND m.market = 'correct_score'
     AND m.selection = c.selection;

  DROP TABLE _cs;
END $$;

REVOKE EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) TO service_role;

-- Wrap seed_match_market_odds so correct_score is re-balanced after seeding.
CREATE OR REPLACE FUNCTION public.regenerate_match_market_odds(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.seed_match_market_odds(p_match_id);
  PERFORM public.adjust_correct_score_odds(p_match_id, 1.25, 100.0);
END $function$;

-- Backfill all existing matches with correct_score odds using the new 100 cap.
DO $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT DISTINCT match_id FROM public.match_market_odds WHERE market = 'correct_score'
  LOOP
    PERFORM public.adjust_correct_score_odds(m.match_id, 1.25, 100.0);
  END LOOP;
END $$;