CREATE OR REPLACE FUNCTION public.seed_match_market_odds(p_match_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_odds jsonb; v_is_sim boolean; v_margin_disabled boolean;
  v_ho numeric; v_do numeric; v_ao numeric;
  v_ph numeric; v_pd numeric; v_pa numeric; v_t numeric;
  v_mu numeric; v_s numeric; v_lh numeric; v_la numeric;
  v_best_err numeric := 1e9; v_best_lh numeric := 1.3; v_best_la numeric := 1.1; v_err numeric;
  v_eph numeric; v_epd numeric; v_epa numeric;
  i int; j int;
  v_pmf_h numeric[]; v_pmf_a numeric[];
  v_p_score numeric; v_total int;
  v_p_g0 numeric:=0; v_p_g1 numeric:=0; v_p_g2 numeric:=0; v_p_g3 numeric:=0; v_p_g4 numeric:=0; v_p_g5p numeric:=0;
  v_p_over_05 numeric:=0; v_p_over_15 numeric:=0; v_p_over_25 numeric:=0;
  v_p_over_35 numeric:=0; v_p_over_45 numeric:=0; v_p_over_55 numeric:=0; v_p_over_65 numeric:=0;
  v_p_btts_yes numeric:=0; v_p_odd numeric:=0;
  v_p_cs_home_yes numeric; v_p_cs_away_yes numeric;
  v_p_wtn_home numeric:=0; v_p_wtn_away numeric:=0;
  v_listed text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2',
    '3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4'];
  v_listed_sum numeric := 0; v_score text; v_prob numeric;
  v_settings public.platform_settings; v_margin numeric; v_overround numeric;
  v_htft_probs jsonb; v_key text;
  v_p_ht_home numeric; v_p_ht_draw numeric; v_p_ht_away numeric;
  v_p_ft_home numeric; v_p_ft_draw numeric; v_p_ft_away numeric;
  v_lh_ht numeric; v_la_ht numeric;
BEGIN
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  v_margin := COALESCE(v_settings.margin_pct, 25) / 100.0;

  SELECT reference_odds, COALESCE(is_simulation, false), COALESCE(margin_disabled, false)
    INTO v_odds, v_is_sim, v_margin_disabled
    FROM public.matches WHERE id = p_match_id;

  IF v_margin_disabled THEN v_overround := 1.0; ELSE v_overround := 1 + v_margin; END IF;

  IF v_odds IS NULL OR (v_odds->>'home') IS NULL OR (v_odds->>'draw') IS NULL OR (v_odds->>'away') IS NULL
     OR NULLIF((v_odds->>'home')::numeric, 0) IS NULL
     OR NULLIF((v_odds->>'draw')::numeric, 0) IS NULL
     OR NULLIF((v_odds->>'away')::numeric, 0) IS NULL THEN
    IF NOT v_is_sim THEN RETURN; END IF;
    v_ho := COALESCE(NULLIF((v_odds->>'home')::numeric, 0), 2.10);
    v_do := COALESCE(NULLIF((v_odds->>'draw')::numeric, 0), 3.30);
    v_ao := COALESCE(NULLIF((v_odds->>'away')::numeric, 0), 3.60);
  ELSE
    v_ho := (v_odds->>'home')::numeric;
    v_do := (v_odds->>'draw')::numeric;
    v_ao := (v_odds->>'away')::numeric;
  END IF;

  v_ph := 1.0/v_ho; v_pd := 1.0/v_do; v_pa := 1.0/v_ao;
  v_t := v_ph + v_pd + v_pa;
  v_ph := v_ph/v_t; v_pd := v_pd/v_t; v_pa := v_pa/v_t;

  v_mu := 1.8;
  WHILE v_mu <= 3.6 LOOP
    v_s := -1.6;
    WHILE v_s <= 1.6 LOOP
      v_lh := (v_mu + v_s)/2.0; v_la := (v_mu - v_s)/2.0;
      IF v_lh > 0.05 AND v_la > 0.05 THEN
        v_eph := 0; v_epd := 0; v_epa := 0;
        FOR i IN 0..8 LOOP FOR j IN 0..8 LOOP
          v_p_score := public.poisson_pmf(v_lh, i) * public.poisson_pmf(v_la, j);
          IF i > j THEN v_eph := v_eph + v_p_score;
          ELSIF i = j THEN v_epd := v_epd + v_p_score;
          ELSE v_epa := v_epa + v_p_score; END IF;
        END LOOP; END LOOP;
        v_err := power(v_eph - v_ph,2) + power(v_epd - v_pd,2) + power(v_epa - v_pa,2);
        IF v_err < v_best_err THEN v_best_err := v_err; v_best_lh := v_lh; v_best_la := v_la; END IF;
      END IF;
      v_s := v_s + 0.1;
    END LOOP;
    v_mu := v_mu + 0.1;
  END LOOP;

  v_lh := v_best_lh; v_la := v_best_la;
  v_pmf_h := ARRAY[]::numeric[]; v_pmf_a := ARRAY[]::numeric[];
  FOR i IN 0..8 LOOP
    v_pmf_h := array_append(v_pmf_h, public.poisson_pmf(v_lh, i));
    v_pmf_a := array_append(v_pmf_a, public.poisson_pmf(v_la, i));
  END LOOP;

  FOR i IN 0..8 LOOP FOR j IN 0..8 LOOP
    v_p_score := v_pmf_h[i+1] * v_pmf_a[j+1];
    v_total := i + j;
    IF v_total = 0 THEN v_p_g0 := v_p_g0 + v_p_score;
    ELSIF v_total = 1 THEN v_p_g1 := v_p_g1 + v_p_score;
    ELSIF v_total = 2 THEN v_p_g2 := v_p_g2 + v_p_score;
    ELSIF v_total = 3 THEN v_p_g3 := v_p_g3 + v_p_score;
    ELSIF v_total = 4 THEN v_p_g4 := v_p_g4 + v_p_score;
    ELSE v_p_g5p := v_p_g5p + v_p_score; END IF;
    IF v_total > 0 THEN v_p_over_05 := v_p_over_05 + v_p_score; END IF;
    IF v_total > 1 THEN v_p_over_15 := v_p_over_15 + v_p_score; END IF;
    IF v_total > 2 THEN v_p_over_25 := v_p_over_25 + v_p_score; END IF;
    IF v_total > 3 THEN v_p_over_35 := v_p_over_35 + v_p_score; END IF;
    IF v_total > 4 THEN v_p_over_45 := v_p_over_45 + v_p_score; END IF;
    IF v_total > 5 THEN v_p_over_55 := v_p_over_55 + v_p_score; END IF;
    IF v_total > 6 THEN v_p_over_65 := v_p_over_65 + v_p_score; END IF;
    IF i > 0 AND j > 0 THEN v_p_btts_yes := v_p_btts_yes + v_p_score; END IF;
    IF (v_total % 2) = 1 THEN v_p_odd := v_p_odd + v_p_score; END IF;
  END LOOP; END LOOP;

  v_p_cs_home_yes := 0;
  FOR i IN 1..8 LOOP v_p_cs_home_yes := v_p_cs_home_yes + v_pmf_h[i+1] * v_pmf_a[1]; END LOOP;
  v_p_cs_away_yes := 0;
  FOR j IN 1..8 LOOP v_p_cs_away_yes := v_p_cs_away_yes + v_pmf_a[j+1] * v_pmf_h[1]; END LOOP;

  v_p_wtn_home := 0; v_p_wtn_away := 0;
  FOR i IN 1..8 LOOP FOR j IN 0..(i-1) LOOP
    v_p_wtn_home := v_p_wtn_home + v_pmf_h[i+1] * v_pmf_a[j+1];
  END LOOP; END LOOP;
  FOR j IN 1..8 LOOP FOR i IN 0..(j-1) LOOP
    v_p_wtn_away := v_p_wtn_away + v_pmf_a[j+1] * v_pmf_h[i+1];
  END LOOP; END LOOP;

  CREATE TEMP TABLE IF NOT EXISTS _mk(market text, selection text, prob numeric) ON COMMIT DROP;
  TRUNCATE TABLE _mk;

  INSERT INTO _mk VALUES
    ('1x2','home', v_ph), ('1x2','draw', v_pd), ('1x2','away', v_pa),
    ('total_goals','over_0_5', v_p_over_05), ('total_goals','under_0_5', 1 - v_p_over_05),
    ('total_goals','over_1_5', v_p_over_15), ('total_goals','under_1_5', 1 - v_p_over_15),
    ('total_goals','over_2_5', v_p_over_25), ('total_goals','under_2_5', 1 - v_p_over_25),
    ('total_goals','over_3_5', v_p_over_35), ('total_goals','under_3_5', 1 - v_p_over_35),
    ('total_goals','over_4_5', v_p_over_45), ('total_goals','under_4_5', 1 - v_p_over_45),
    ('total_goals','over_5_5', v_p_over_55), ('total_goals','under_5_5', 1 - v_p_over_55),
    ('total_goals','over_6_5', v_p_over_65), ('total_goals','under_6_5', 1 - v_p_over_65),
    ('btts','yes', v_p_btts_yes), ('btts','no', 1 - v_p_btts_yes),
    ('exact_goals','0', v_p_g0), ('exact_goals','1', v_p_g1), ('exact_goals','2', v_p_g2),
    ('exact_goals','3', v_p_g3), ('exact_goals','4', v_p_g4), ('exact_goals','5_plus', v_p_g5p),
    ('odd_even','odd', v_p_odd), ('odd_even','even', 1 - v_p_odd),
    ('clean_sheet_home','yes', 1 - v_p_cs_home_yes), ('clean_sheet_home','no', v_p_cs_home_yes),
    ('clean_sheet_away','yes', 1 - v_p_cs_away_yes), ('clean_sheet_away','no', v_p_cs_away_yes),
    ('win_to_nil_home','yes', v_p_wtn_home), ('win_to_nil_home','no', 1 - v_p_wtn_home),
    ('win_to_nil_away','yes', v_p_wtn_away), ('win_to_nil_away','no', 1 - v_p_wtn_away),
    ('double_chance','home_or_draw', v_ph + v_pd),
    ('double_chance','draw_or_away', v_pd + v_pa),
    ('double_chance','home_or_away', v_ph + v_pa),
    ('draw_no_bet','home', v_ph / GREATEST(v_ph + v_pa, 0.0001)),
    ('draw_no_bet','away', v_pa / GREATEST(v_ph + v_pa, 0.0001));

  v_listed_sum := 0;
  FOREACH v_score IN ARRAY v_listed LOOP
    DECLARE
      v_parts text[]; v_hi int; v_ai int;
    BEGIN
      v_parts := string_to_array(v_score, '-');
      v_hi := v_parts[1]::int; v_ai := v_parts[2]::int;
      v_prob := v_pmf_h[v_hi+1] * v_pmf_a[v_ai+1];
      v_listed_sum := v_listed_sum + v_prob;
      INSERT INTO _mk VALUES ('correct_score', v_score, v_prob);
    END;
  END LOOP;
  INSERT INTO _mk VALUES ('correct_score','OTHER', GREATEST(0, 1 - v_listed_sum));

  v_lh_ht := v_lh / 2.0; v_la_ht := v_la / 2.0;
  DECLARE
    v_pmf_h_ht numeric[]; v_pmf_a_ht numeric[];
  BEGIN
    v_pmf_h_ht := ARRAY[]::numeric[]; v_pmf_a_ht := ARRAY[]::numeric[];
    FOR i IN 0..8 LOOP
      v_pmf_h_ht := array_append(v_pmf_h_ht, public.poisson_pmf(v_lh_ht, i));
      v_pmf_a_ht := array_append(v_pmf_a_ht, public.poisson_pmf(v_la_ht, i));
    END LOOP;
    v_p_ht_home := 0; v_p_ht_draw := 0; v_p_ht_away := 0;
    FOR i IN 0..8 LOOP FOR j IN 0..8 LOOP
      v_p_score := v_pmf_h_ht[i+1] * v_pmf_a_ht[j+1];
      IF i > j THEN v_p_ht_home := v_p_ht_home + v_p_score;
      ELSIF i = j THEN v_p_ht_draw := v_p_ht_draw + v_p_score;
      ELSE v_p_ht_away := v_p_ht_away + v_p_score; END IF;
    END LOOP; END LOOP;

    v_htft_probs := jsonb_build_object(
      'home/home', v_p_ht_home * v_ph,
      'home/draw', v_p_ht_home * v_pd * 0.1,
      'home/away', v_p_ht_home * v_pa * 0.1,
      'draw/home', v_p_ht_draw * v_ph,
      'draw/draw', v_p_ht_draw * v_pd,
      'draw/away', v_p_ht_draw * v_pa,
      'away/home', v_p_ht_away * v_ph * 0.1,
      'away/draw', v_p_ht_away * v_pd * 0.1,
      'away/away', v_p_ht_away * v_pa
    );
    FOR v_key IN SELECT jsonb_object_keys(v_htft_probs) LOOP
      INSERT INTO _mk VALUES ('half_time_full_time', v_key, (v_htft_probs->>v_key)::numeric);
    END LOOP;
  END;

  INSERT INTO public.match_market_odds (match_id, market, selection, odds, source, generated, active)
  SELECT
    p_match_id, m.market, m.selection,
    ROUND(LEAST(public.market_odds_cap(m.market),
      GREATEST(1.01, (1.0 / GREATEST(m.prob, 0.0001)) / v_overround))::numeric, 2),
    'derived_poisson', true, true
  FROM _mk m
  ON CONFLICT (match_id, market, selection) DO UPDATE
    SET odds = EXCLUDED.odds, source = EXCLUDED.source, generated = true, active = true, updated_at = now()
    WHERE match_market_odds.source IS DISTINCT FROM 'api-football';
END $function$;