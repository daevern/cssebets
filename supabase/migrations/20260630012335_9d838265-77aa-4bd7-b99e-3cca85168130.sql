
CREATE OR REPLACE FUNCTION public.seed_cards_corners_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_margin numeric;
  v_mu_cards numeric := 4.0;
  v_mu_corners numeric := 10.0;
  v_p numeric;
  v_lines numeric[] := ARRAY[2.5,3.5,4.5,5.5];
  v_corner_lines numeric[] := ARRAY[8.5,9.5,10.5,11.5];
  v_line numeric;
  v_key text;
  v_sel_over text; v_sel_under text;
  v_o numeric;
BEGIN
  SELECT COALESCE(margin_pct, 7.0) INTO v_margin FROM public.platform_settings WHERE id = 1;

  -- helper macro for clamped odds
  -- price = max(1.01, (1/p) * (1 - margin/100))

  FOREACH v_line IN ARRAY v_lines LOOP
    v_p := 0;
    FOR i IN CEIL(v_line)::int..20 LOOP v_p := v_p + public.poisson_pmf(v_mu_cards, i); END LOOP;
    v_key := 'cards_over_under_' || replace(v_line::text, '.', '_');
    v_sel_over := 'OVER_' || replace(v_line::text, '.', '_');
    v_sel_under := 'UNDER_' || replace(v_line::text, '.', '_');
    INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
      (p_match_id, v_key, v_sel_over,  GREATEST(1.01, ROUND(((1.0/GREATEST(v_p,0.02))   * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards'),
      (p_match_id, v_key, v_sel_under, GREATEST(1.01, ROUND(((1.0/GREATEST(1-v_p,0.02)) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards')
    ON CONFLICT (match_id, market, selection) DO NOTHING;
  END LOOP;

  FOR i IN 0..1 LOOP
    DECLARE
      v_team text := CASE i WHEN 0 THEN 'home' ELSE 'away' END;
      v_mu_t numeric := v_mu_cards / 2.0;
      v_pt numeric := 0;
    BEGIN
      FOR k IN 2..20 LOOP v_pt := v_pt + public.poisson_pmf(v_mu_t, k); END LOOP;
      v_key := v_team || '_cards_over_under_1_5';
      INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
        (p_match_id, v_key, 'OVER_1_5',  GREATEST(1.01, ROUND(((1.0/GREATEST(v_pt,0.02))   * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards'),
        (p_match_id, v_key, 'UNDER_1_5', GREATEST(1.01, ROUND(((1.0/GREATEST(1-v_pt,0.02)) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards')
      ON CONFLICT (match_id, market, selection) DO NOTHING;
    END;
  END LOOP;

  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
    (p_match_id, 'red_card_match', 'YES', GREATEST(1.01, ROUND(((1.0/0.12) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards'),
    (p_match_id, 'red_card_match', 'NO',  GREATEST(1.01, ROUND(((1.0/0.88) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards')
  ON CONFLICT (match_id, market, selection) DO NOTHING;

  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
    (p_match_id, 'first_card', 'HOME', GREATEST(1.01, ROUND(((1.0/0.48) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards'),
    (p_match_id, 'first_card', 'AWAY', GREATEST(1.01, ROUND(((1.0/0.48) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards'),
    (p_match_id, 'first_card', 'NONE', GREATEST(1.01, ROUND(((1.0/0.04) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_cards')
  ON CONFLICT (match_id, market, selection) DO NOTHING;

  FOREACH v_line IN ARRAY v_corner_lines LOOP
    v_p := 0;
    FOR i IN CEIL(v_line)::int..40 LOOP v_p := v_p + public.poisson_pmf(v_mu_corners, i); END LOOP;
    v_key := 'corners_over_under_' || replace(v_line::text, '.', '_');
    v_sel_over := 'OVER_' || replace(v_line::text, '.', '_');
    v_sel_under := 'UNDER_' || replace(v_line::text, '.', '_');
    INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
      (p_match_id, v_key, v_sel_over,  GREATEST(1.01, ROUND(((1.0/GREATEST(v_p,0.02))   * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners'),
      (p_match_id, v_key, v_sel_under, GREATEST(1.01, ROUND(((1.0/GREATEST(1-v_p,0.02)) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners')
    ON CONFLICT (match_id, market, selection) DO NOTHING;
  END LOOP;

  FOR i IN 0..1 LOOP
    DECLARE
      v_team text := CASE i WHEN 0 THEN 'home' ELSE 'away' END;
      v_mu_t numeric := v_mu_corners / 2.0;
      v_pt numeric := 0;
    BEGIN
      FOR k IN 5..40 LOOP v_pt := v_pt + public.poisson_pmf(v_mu_t, k); END LOOP;
      v_key := v_team || '_corners_over_under_4_5';
      INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
        (p_match_id, v_key, 'OVER_4_5',  GREATEST(1.01, ROUND(((1.0/GREATEST(v_pt,0.02))   * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners'),
        (p_match_id, v_key, 'UNDER_4_5', GREATEST(1.01, ROUND(((1.0/GREATEST(1-v_pt,0.02)) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners')
      ON CONFLICT (match_id, market, selection) DO NOTHING;
    END;
  END LOOP;

  INSERT INTO public.match_market_odds(match_id, market, selection, odds, active, source) VALUES
    (p_match_id, 'first_corner', 'HOME', GREATEST(1.01, ROUND(((1.0/0.49) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners'),
    (p_match_id, 'first_corner', 'AWAY', GREATEST(1.01, ROUND(((1.0/0.49) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners'),
    (p_match_id, 'first_corner', 'NONE', GREATEST(1.01, ROUND(((1.0/0.02) * (1 - v_margin/100.0))::numeric, 2)), true, 'derived_corners')
  ON CONFLICT (match_id, market, selection) DO NOTHING;
END $$;
