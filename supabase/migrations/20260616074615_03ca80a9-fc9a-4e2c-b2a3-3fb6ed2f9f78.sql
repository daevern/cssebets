
-- Lower minimum odds floor to 1.01 across odds generation paths.
-- Keeps existing Poisson/odds model intact; only changes the lower clamp.

CREATE OR REPLACE FUNCTION public.seed_match_market_odds(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_odds jsonb;
  v_ho numeric; v_do numeric; v_ao numeric;
  v_ph numeric; v_pd numeric; v_pa numeric; v_t numeric;
  v_mu numeric; v_s numeric; v_lh numeric; v_la numeric;
  v_best_err numeric := 1e9; v_best_lh numeric := 1.3; v_best_la numeric := 1.1;
  v_err numeric;
  v_eph numeric; v_epd numeric; v_epa numeric;
  i int; j int;
  v_pmf_h numeric[]; v_pmf_a numeric[];
  v_p_over numeric; v_p_btts_yes numeric;
  v_p_g0 numeric; v_p_g1 numeric; v_p_g2 numeric; v_p_g3 numeric; v_p_g4 numeric; v_p_g5p numeric;
  v_p_score numeric;
  v_total int;
  v_listed text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2',
    '3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4'];
  v_listed_sum numeric := 0;
  v_score text;
  v_settings public.platform_settings;
  v_margin numeric;
  v_overround numeric;
  v_prob numeric;
BEGIN
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  v_margin := COALESCE(v_settings.margin_pct, 6) / 100.0;
  v_overround := 1 + v_margin;

  SELECT reference_odds INTO v_odds FROM public.matches WHERE id = p_match_id;
  v_ho := COALESCE(NULLIF((v_odds->>'home')::numeric, 0), 2.10);
  v_do := COALESCE(NULLIF((v_odds->>'draw')::numeric, 0), 3.30);
  v_ao := COALESCE(NULLIF((v_odds->>'away')::numeric, 0), 3.60);

  v_ph := 1.0 / v_ho; v_pd := 1.0 / v_do; v_pa := 1.0 / v_ao;
  v_t := v_ph + v_pd + v_pa;
  v_ph := v_ph / v_t; v_pd := v_pd / v_t; v_pa := v_pa / v_t;

  v_mu := 1.8;
  WHILE v_mu <= 3.6 LOOP
    v_s := -1.6;
    WHILE v_s <= 1.6 LOOP
      v_lh := (v_mu + v_s) / 2.0;
      v_la := (v_mu - v_s) / 2.0;
      IF v_lh > 0.05 AND v_la > 0.05 THEN
        v_eph := 0; v_epd := 0; v_epa := 0;
        FOR i IN 0..8 LOOP
          FOR j IN 0..8 LOOP
            v_p_score := public.poisson_pmf(v_lh, i) * public.poisson_pmf(v_la, j);
            IF i > j THEN v_eph := v_eph + v_p_score;
            ELSIF i = j THEN v_epd := v_epd + v_p_score;
            ELSE v_epa := v_epa + v_p_score; END IF;
          END LOOP;
        END LOOP;
        v_err := power(v_eph - v_ph, 2) + power(v_epd - v_pd, 2) + power(v_epa - v_pa, 2);
        IF v_err < v_best_err THEN
          v_best_err := v_err; v_best_lh := v_lh; v_best_la := v_la;
        END IF;
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

  v_p_over := 0; v_p_btts_yes := 0;
  v_p_g0 := 0; v_p_g1 := 0; v_p_g2 := 0; v_p_g3 := 0; v_p_g4 := 0; v_p_g5p := 0;
  FOR i IN 0..8 LOOP
    FOR j IN 0..8 LOOP
      v_p_score := v_pmf_h[i+1] * v_pmf_a[j+1];
      v_total := i + j;
      IF v_total > 2 THEN v_p_over := v_p_over + v_p_score; END IF;
      IF i > 0 AND j > 0 THEN v_p_btts_yes := v_p_btts_yes + v_p_score; END IF;
      CASE v_total
        WHEN 0 THEN v_p_g0 := v_p_g0 + v_p_score;
        WHEN 1 THEN v_p_g1 := v_p_g1 + v_p_score;
        WHEN 2 THEN v_p_g2 := v_p_g2 + v_p_score;
        WHEN 3 THEN v_p_g3 := v_p_g3 + v_p_score;
        WHEN 4 THEN v_p_g4 := v_p_g4 + v_p_score;
        ELSE v_p_g5p := v_p_g5p + v_p_score;
      END CASE;
    END LOOP;
  END LOOP;

  CREATE TEMP TABLE IF NOT EXISTS _mk(market text, selection text, prob numeric) ON COMMIT DROP;
  DELETE FROM _mk;

  INSERT INTO _mk VALUES ('over_under_2_5','OVER_2_5', v_p_over),
                         ('over_under_2_5','UNDER_2_5', 1 - v_p_over);
  INSERT INTO _mk VALUES ('btts','YES', v_p_btts_yes),
                         ('btts','NO', 1 - v_p_btts_yes);
  INSERT INTO _mk VALUES
    ('exact_total_goals','GOALS_0', v_p_g0),
    ('exact_total_goals','GOALS_1', v_p_g1),
    ('exact_total_goals','GOALS_2', v_p_g2),
    ('exact_total_goals','GOALS_3', v_p_g3),
    ('exact_total_goals','GOALS_4', v_p_g4),
    ('exact_total_goals','GOALS_5_PLUS', v_p_g5p);

  v_listed_sum := 0;
  FOREACH v_score IN ARRAY v_listed LOOP
    i := split_part(v_score,'-',1)::int;
    j := split_part(v_score,'-',2)::int;
    v_prob := v_pmf_h[i+1] * v_pmf_a[j+1];
    INSERT INTO _mk VALUES ('correct_score', v_score, v_prob);
    v_listed_sum := v_listed_sum + v_prob;
  END LOOP;
  INSERT INTO _mk VALUES ('correct_score','OTHER', GREATEST(0, 1 - v_listed_sum));

  DECLARE
    v_lh1 numeric := v_lh * 0.45; v_la1 numeric := v_la * 0.45;
    v_lh2 numeric := v_lh * 0.55; v_la2 numeric := v_la * 0.55;
    v_pm numeric;
    v_htft_probs jsonb;
    v_kh int; v_ka int;
    v_ht_lbl text; v_ft_lbl text; v_key text;
    v_acc numeric;
  BEGIN
    v_htft_probs := jsonb_build_object(
      'HOME_HOME', 0::numeric, 'HOME_DRAW', 0::numeric, 'HOME_AWAY', 0::numeric,
      'DRAW_HOME', 0::numeric, 'DRAW_DRAW', 0::numeric, 'DRAW_AWAY', 0::numeric,
      'AWAY_HOME', 0::numeric, 'AWAY_DRAW', 0::numeric, 'AWAY_AWAY', 0::numeric
    );
    FOR i IN 0..5 LOOP FOR j IN 0..5 LOOP
      FOR v_kh IN 0..5 LOOP FOR v_ka IN 0..5 LOOP
        v_pm := public.poisson_pmf(v_lh1, i) * public.poisson_pmf(v_la1, j)
              * public.poisson_pmf(v_lh2, v_kh) * public.poisson_pmf(v_la2, v_ka);
        IF i > j THEN v_ht_lbl := 'HOME';
        ELSIF i = j THEN v_ht_lbl := 'DRAW';
        ELSE v_ht_lbl := 'AWAY'; END IF;
        IF (i+v_kh) > (j+v_ka) THEN v_ft_lbl := 'HOME';
        ELSIF (i+v_kh) = (j+v_ka) THEN v_ft_lbl := 'DRAW';
        ELSE v_ft_lbl := 'AWAY'; END IF;
        v_key := v_ht_lbl || '_' || v_ft_lbl;
        v_acc := COALESCE((v_htft_probs->>v_key)::numeric, 0) + v_pm;
        v_htft_probs := jsonb_set(v_htft_probs, ARRAY[v_key], to_jsonb(v_acc));
      END LOOP; END LOOP;
    END LOOP; END LOOP;

    FOR v_key IN SELECT jsonb_object_keys(v_htft_probs) LOOP
      INSERT INTO _mk VALUES ('half_time_full_time', v_key, (v_htft_probs->>v_key)::numeric);
    END LOOP;
  END;

  INSERT INTO public.match_market_odds (match_id, market, selection, odds, source, generated, active)
  SELECT
    p_match_id,
    m.market,
    m.selection,
    ROUND(
      LEAST(
        public.market_odds_cap(m.market),
        GREATEST(1.01, (1.0 / GREATEST(m.prob, 0.0001)) / v_overround)
      )::numeric, 2),
    'derived_poisson',
    true,
    true
  FROM _mk m
  ON CONFLICT (match_id, market, selection) DO UPDATE
    SET odds = EXCLUDED.odds,
        source = EXCLUDED.source,
        generated = true,
        active = true,
        updated_at = now();
END $$;

REVOKE EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.seed_match_market_odds(uuid) TO service_role;

-- Lower clamp in correct-score adjuster too
CREATE OR REPLACE FUNCTION public.adjust_correct_score_odds(
  p_match_id uuid,
  p_target_overround numeric DEFAULT 1.25,
  p_max_odds numeric DEFAULT 1000000.0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_raw_total numeric := 0;
  v_capped_sum numeric := 0;
  v_uncapped_sum numeric := 0;
  v_scale numeric;
  v_residual numeric;
  v_implied numeric;
  r RECORD;
  v_iter int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _cs(
    selection text,
    prob numeric,
    odds numeric,
    capped boolean
  ) ON COMMIT DROP;
  DELETE FROM _cs;

  FOR r IN
    SELECT selection, odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = 'correct_score' AND active = true
  LOOP
    IF r.odds IS NULL OR r.odds < 1.01 THEN CONTINUE; END IF;
    v_implied := 1.0 / r.odds;
    v_raw_total := v_raw_total + v_implied;
    INSERT INTO _cs(selection, prob, odds, capped)
      VALUES (r.selection, v_implied, r.odds, false);
  END LOOP;

  IF v_raw_total <= 0 THEN RETURN; END IF;

  UPDATE _cs SET prob = prob / v_raw_total;

  UPDATE _cs
     SET capped = (1.0 / (prob * p_target_overround)) >= p_max_odds,
         odds = LEAST(p_max_odds, 1.0 / (prob * p_target_overround));

  LOOP
    SELECT
      COALESCE(SUM(CASE WHEN capped THEN 1.0/odds ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN NOT capped THEN 1.0/odds ELSE 0 END), 0)
      INTO v_capped_sum, v_uncapped_sum FROM _cs;
    EXIT WHEN v_uncapped_sum <= 0;
    v_residual := p_target_overround - v_capped_sum;
    EXIT WHEN v_residual <= 0;
    v_scale := v_uncapped_sum / v_residual;
    EXIT WHEN abs(v_scale - 1.0) < 0.0005;
    UPDATE _cs
       SET odds = LEAST(p_max_odds, odds / v_scale),
           capped = capped OR (odds / v_scale) >= p_max_odds
     WHERE NOT capped;
    v_iter := v_iter + 1;
    EXIT WHEN v_iter > 10;
  END LOOP;

  UPDATE public.match_market_odds m
     SET odds = ROUND(GREATEST(1.01, c.odds)::numeric, 2),
         updated_at = now()
    FROM _cs c
   WHERE m.match_id = p_match_id
     AND m.market = 'correct_score'
     AND m.selection = c.selection;
END $$;

REVOKE EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_correct_score_odds(uuid, numeric, numeric) TO service_role;

-- Clamp any existing rows currently below 1.01 up to 1.01
UPDATE public.match_market_odds
   SET odds = 1.01,
       updated_at = now()
 WHERE odds IS NOT NULL AND odds < 1.01;
