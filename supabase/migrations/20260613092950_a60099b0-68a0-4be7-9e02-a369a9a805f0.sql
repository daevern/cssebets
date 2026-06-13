
-- 1) Tighten platform settings for a ~100-200 user base
UPDATE public.platform_settings
   SET max_stake_per_bet = LEAST(max_stake_per_bet, 2000),
       max_potential_payout = LEAST(max_potential_payout, 20000),
       updated_at = now()
 WHERE id = 1;

-- 2) Helper: per-market odds ceiling
CREATE OR REPLACE FUNCTION public.market_odds_cap(p_market text)
RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_market
    WHEN 'over_under_2_5'      THEN 10.0
    WHEN 'btts'                THEN 10.0
    WHEN 'exact_total_goals'   THEN 15.0
    WHEN 'half_time_full_time' THEN 20.0
    WHEN 'correct_score'       THEN 20.0
    ELSE 20.0
  END::numeric
$$;

-- 3) Patch the seeder's final upsert to clamp odds to the cap
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
        GREATEST(1.05, (1.0 / GREATEST(m.prob, 0.0001)) / v_overround)
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

-- 4) Clamp existing rows already stored above the cap
UPDATE public.match_market_odds
   SET odds = public.market_odds_cap(market),
       updated_at = now()
 WHERE odds > public.market_odds_cap(market);
