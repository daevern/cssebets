CREATE OR REPLACE FUNCTION public.market_odds_cap(p_market text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_market
    WHEN 'half_time_full_time' THEN 20.0
    WHEN 'correct_score'       THEN 100.0
    ELSE 20.0
  END::numeric
$$;

-- Re-seed and re-adjust every match's correct_score odds under the 100 cap.
DO $$
DECLARE m RECORD;
BEGIN
  FOR m IN SELECT DISTINCT match_id FROM public.match_market_odds WHERE market = 'correct_score'
  LOOP
    PERFORM public.seed_match_market_odds(m.match_id);
    PERFORM public.adjust_correct_score_odds(m.match_id, 1.25, 100.0);
  END LOOP;
END $$;