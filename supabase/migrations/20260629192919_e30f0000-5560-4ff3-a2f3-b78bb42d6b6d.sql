
-- 1. place_market_bet_atomic: allow the new market keys
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(p_user_id uuid, p_match_id uuid, p_market text, p_selection text, p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_odds numeric; v_pred_id uuid; v_potential numeric;
  v_settings public.platform_settings; v_caller text;
  v_match RECORD; v_sim boolean := false; v_existing uuid;
  v_snap_id uuid;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_market_bet_atomic is service-role only';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN (
    'over_under_0_5','over_under_1_5','over_under_2_5','over_under_3_5','over_under_4_5','over_under_5_5','over_under_6_5',
    'btts','correct_score','half_time_full_time','exact_total_goals','to_qualify',
    'double_chance','draw_no_bet','goals_odd_even',
    'clean_sheet_home','clean_sheet_away','win_to_nil_home','win_to_nil_away'
  ) THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);
  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  IF v_odds IS NULL AND v_sim THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id=p_match_id AND market=p_market AND selection=p_selection AND active=true LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'ODDS_MISSING'; END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);
  IF NOT v_sim THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market, p_selection, p_stake, v_odds);
    PERFORM public.assert_user_match_risk(p_user_id, p_match_id, p_market, p_selection, p_stake, v_odds);
  END IF;
  v_potential := ROUND(p_stake * v_odds, 2);
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;
  INSERT INTO public.market_odds_snapshots(match_id, market, selection, odds, source)
    VALUES (p_match_id, p_market, p_selection, v_odds, 'internal')
    RETURNING id INTO v_snap_id;
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(),
    'Bet placed ('||p_market||')', v_sim);
  BEGIN
    INSERT INTO public.predictions(
      user_id, match_id, market, outcome,
      reference_odds, reference_odds_snapshot_id, virtual_stake, potential_return,
      is_simulation, client_request_id, market_text, selection_label)
    VALUES (
      p_user_id, p_match_id,
      CASE
        WHEN p_market LIKE 'over_under_%' OR p_market = 'goals_odd_even' THEN 'total_goals'::public.prediction_market
        WHEN p_market = 'btts' THEN 'btts'::public.prediction_market
        WHEN p_market = 'correct_score' THEN 'correct_score'::public.prediction_market
        WHEN p_market = 'half_time_full_time' THEN 'first_scorer'::public.prediction_market
        WHEN p_market = 'exact_total_goals' THEN 'group_winner'::public.prediction_market
        WHEN p_market = 'to_qualify' THEN 'tournament_winner'::public.prediction_market
        ELSE 'result'::public.prediction_market
      END,
      p_market || ':' || p_selection,
      v_odds, NULL, p_stake, v_potential,
      v_sim, p_client_request_id, p_market, p_selection
    ) RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST: one bet per market per match allowed';
  END;
  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id,
    'Stake collected ('||p_market||')', v_sim);
  RETURN v_pred_id;
END $function$;

-- 2. seed_match_market_odds: derive seed odds for all new markets from the same Poisson fit
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
    IF v_total >= 1 THEN v_p_over_05 := v_p_over_05 + v_p_score; END IF;
    IF v_total >= 2 THEN v_p_over_15 := v_p_over_15 + v_p_score; END IF;
    IF v_total >= 3 THEN v_p_over_25 := v_p_over_25 + v_p_score; END IF;
    IF v_total >= 4 THEN v_p_over_35 := v_p_over_35 + v_p_score; END IF;
    IF v_total >= 5 THEN v_p_over_45 := v_p_over_45 + v_p_score; END IF;
    IF v_total >= 6 THEN v_p_over_55 := v_p_over_55 + v_p_score; END IF;
    IF v_total >= 7 THEN v_p_over_65 := v_p_over_65 + v_p_score; END IF;
    IF i > 0 AND j > 0 THEN v_p_btts_yes := v_p_btts_yes + v_p_score; END IF;
    IF (v_total % 2) = 1 THEN v_p_odd := v_p_odd + v_p_score; END IF;
    CASE v_total
      WHEN 0 THEN v_p_g0 := v_p_g0 + v_p_score;
      WHEN 1 THEN v_p_g1 := v_p_g1 + v_p_score;
      WHEN 2 THEN v_p_g2 := v_p_g2 + v_p_score;
      WHEN 3 THEN v_p_g3 := v_p_g3 + v_p_score;
      WHEN 4 THEN v_p_g4 := v_p_g4 + v_p_score;
      ELSE v_p_g5p := v_p_g5p + v_p_score;
    END CASE;
  END LOOP; END LOOP;

  v_p_cs_home_yes := v_pmf_a[1];      -- away scored 0
  v_p_cs_away_yes := v_pmf_h[1];      -- home scored 0
  v_p_wtn_home := (1 - v_pmf_h[1]) * v_pmf_a[1];   -- home>=1 AND away=0
  v_p_wtn_away := (1 - v_pmf_a[1]) * v_pmf_h[1];

  CREATE TEMP TABLE IF NOT EXISTS _mk(market text, selection text, prob numeric) ON COMMIT DROP;
  TRUNCATE TABLE _mk;

  INSERT INTO _mk VALUES
    ('over_under_0_5','OVER_0_5',  v_p_over_05), ('over_under_0_5','UNDER_0_5', 1 - v_p_over_05),
    ('over_under_1_5','OVER_1_5',  v_p_over_15), ('over_under_1_5','UNDER_1_5', 1 - v_p_over_15),
    ('over_under_2_5','OVER_2_5',  v_p_over_25), ('over_under_2_5','UNDER_2_5', 1 - v_p_over_25),
    ('over_under_3_5','OVER_3_5',  v_p_over_35), ('over_under_3_5','UNDER_3_5', 1 - v_p_over_35),
    ('over_under_4_5','OVER_4_5',  v_p_over_45), ('over_under_4_5','UNDER_4_5', 1 - v_p_over_45),
    ('over_under_5_5','OVER_5_5',  v_p_over_55), ('over_under_5_5','UNDER_5_5', 1 - v_p_over_55),
    ('over_under_6_5','OVER_6_5',  v_p_over_65), ('over_under_6_5','UNDER_6_5', 1 - v_p_over_65),
    ('btts','YES', v_p_btts_yes), ('btts','NO', 1 - v_p_btts_yes),
    ('goals_odd_even','ODD', v_p_odd), ('goals_odd_even','EVEN', 1 - v_p_odd),
    ('exact_total_goals','GOALS_0', v_p_g0),
    ('exact_total_goals','GOALS_1', v_p_g1),
    ('exact_total_goals','GOALS_2', v_p_g2),
    ('exact_total_goals','GOALS_3', v_p_g3),
    ('exact_total_goals','GOALS_4', v_p_g4),
    ('exact_total_goals','GOALS_5_PLUS', v_p_g5p),
    ('double_chance','HOME_OR_DRAW', v_ph + v_pd),
    ('double_chance','HOME_OR_AWAY', v_ph + v_pa),
    ('double_chance','DRAW_OR_AWAY', v_pd + v_pa),
    ('draw_no_bet','HOME', v_ph / GREATEST(v_ph + v_pa, 0.0001)),
    ('draw_no_bet','AWAY', v_pa / GREATEST(v_ph + v_pa, 0.0001)),
    ('clean_sheet_home','YES', v_p_cs_home_yes), ('clean_sheet_home','NO', 1 - v_p_cs_home_yes),
    ('clean_sheet_away','YES', v_p_cs_away_yes), ('clean_sheet_away','NO', 1 - v_p_cs_away_yes),
    ('win_to_nil_home','YES', v_p_wtn_home), ('win_to_nil_home','NO', 1 - v_p_wtn_home),
    ('win_to_nil_away','YES', v_p_wtn_away), ('win_to_nil_away','NO', 1 - v_p_wtn_away);

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
    v_pm numeric; v_htft_probs jsonb;
    v_kh int; v_ka int; v_ht_lbl text; v_ft_lbl text; v_key text; v_acc numeric;
  BEGIN
    v_htft_probs := jsonb_build_object(
      'HOME_HOME', 0::numeric, 'HOME_DRAW', 0::numeric, 'HOME_AWAY', 0::numeric,
      'DRAW_HOME', 0::numeric, 'DRAW_DRAW', 0::numeric, 'DRAW_AWAY', 0::numeric,
      'AWAY_HOME', 0::numeric, 'AWAY_DRAW', 0::numeric, 'AWAY_AWAY', 0::numeric);
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
    p_match_id, m.market, m.selection,
    ROUND(LEAST(public.market_odds_cap(m.market),
      GREATEST(1.01, (1.0 / GREATEST(m.prob, 0.0001)) / v_overround))::numeric, 2),
    'derived_poisson', true, true
  FROM _mk m
  ON CONFLICT (match_id, market, selection) DO UPDATE
    SET odds = EXCLUDED.odds, source = EXCLUDED.source, generated = true, active = true, updated_at = now();
END $function$;

-- 3. settle_new_markets_for_match: grade all new markets
CREATE OR REPLACE FUNCTION public.settle_new_markets_for_match(p_match_id uuid, p_home integer, p_away integer, p_home_ht integer DEFAULT NULL::integer, p_away_ht integer DEFAULT NULL::integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD; v_count int := 0; v_total int; v_score_text text;
  v_listed_scores text[] := ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2',
    '3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4'];
  v_won boolean; v_void boolean; v_payout numeric; v_sim boolean;
  v_ht_res text; v_ft_res text; v_target text; v_line int;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id = p_match_id;
  v_sim := COALESCE(v_sim, false);
  v_total := COALESCE(p_home,0) + COALESCE(p_away,0);
  v_score_text := p_home || '-' || p_away;

  IF p_home > p_away THEN v_ft_res := 'HOME';
  ELSIF p_home < p_away THEN v_ft_res := 'AWAY';
  ELSE v_ft_res := 'DRAW'; END IF;

  IF p_home_ht IS NOT NULL AND p_away_ht IS NOT NULL THEN
    IF p_home_ht > p_away_ht THEN v_ht_res := 'HOME';
    ELSIF p_home_ht < p_away_ht THEN v_ht_res := 'AWAY';
    ELSE v_ht_res := 'DRAW'; END IF;
  END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id
      AND status = 'pending'::public.prediction_status
      AND (
        market_text IN ('btts','correct_score','half_time_full_time','exact_total_goals',
                        'double_chance','draw_no_bet','goals_odd_even',
                        'clean_sheet_home','clean_sheet_away','win_to_nil_home','win_to_nil_away')
        OR market_text LIKE 'over_under_%'
      )
    FOR UPDATE
  LOOP
    v_won := false; v_void := false;

    IF v_pred.market_text LIKE 'over_under_%' THEN
      v_line := split_part(v_pred.market_text, '_', 3)::int;  -- 0..6
      IF v_pred.selection_label LIKE 'OVER_%' THEN
        v_won := v_total > v_line;
      ELSIF v_pred.selection_label LIKE 'UNDER_%' THEN
        v_won := v_total <= v_line;
      END IF;

    ELSIF v_pred.market_text = 'btts' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home > 0 AND p_away > 0)
            OR (v_pred.selection_label = 'NO'  AND (p_home = 0 OR p_away = 0));

    ELSIF v_pred.market_text = 'goals_odd_even' THEN
      v_won := (v_pred.selection_label = 'ODD'  AND (v_total % 2) = 1)
            OR (v_pred.selection_label = 'EVEN' AND (v_total % 2) = 0);

    ELSIF v_pred.market_text = 'double_chance' THEN
      v_won := CASE v_pred.selection_label
        WHEN 'HOME_OR_DRAW' THEN v_ft_res IN ('HOME','DRAW')
        WHEN 'HOME_OR_AWAY' THEN v_ft_res IN ('HOME','AWAY')
        WHEN 'DRAW_OR_AWAY' THEN v_ft_res IN ('DRAW','AWAY')
        ELSE false END;

    ELSIF v_pred.market_text = 'draw_no_bet' THEN
      IF v_ft_res = 'DRAW' THEN
        v_void := true;
      ELSE
        v_won := (v_pred.selection_label = 'HOME' AND v_ft_res = 'HOME')
              OR (v_pred.selection_label = 'AWAY' AND v_ft_res = 'AWAY');
      END IF;

    ELSIF v_pred.market_text = 'clean_sheet_home' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_away = 0)
            OR (v_pred.selection_label = 'NO'  AND p_away > 0);
    ELSIF v_pred.market_text = 'clean_sheet_away' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home = 0)
            OR (v_pred.selection_label = 'NO'  AND p_home > 0);

    ELSIF v_pred.market_text = 'win_to_nil_home' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_home > p_away AND p_away = 0)
            OR (v_pred.selection_label = 'NO'  AND NOT (p_home > p_away AND p_away = 0));
    ELSIF v_pred.market_text = 'win_to_nil_away' THEN
      v_won := (v_pred.selection_label = 'YES' AND p_away > p_home AND p_home = 0)
            OR (v_pred.selection_label = 'NO'  AND NOT (p_away > p_home AND p_home = 0));

    ELSIF v_pred.market_text = 'correct_score' THEN
      IF v_pred.selection_label = 'OTHER' THEN
        v_won := NOT (v_score_text = ANY(v_listed_scores));
      ELSE
        v_won := v_pred.selection_label = v_score_text;
      END IF;

    ELSIF v_pred.market_text = 'exact_total_goals' THEN
      v_won := CASE v_pred.selection_label
        WHEN 'GOALS_0' THEN v_total = 0
        WHEN 'GOALS_1' THEN v_total = 1
        WHEN 'GOALS_2' THEN v_total = 2
        WHEN 'GOALS_3' THEN v_total = 3
        WHEN 'GOALS_4' THEN v_total = 4
        WHEN 'GOALS_5_PLUS' THEN v_total >= 5
        ELSE false END;

    ELSIF v_pred.market_text = 'half_time_full_time' THEN
      IF v_ht_res IS NULL THEN
        v_void := true;
      ELSE
        v_target := v_ht_res || '_' || v_ft_res;
        v_won := v_pred.selection_label = v_target;
      END IF;
    END IF;

    IF v_void THEN
      UPDATE public.predictions SET status='void', settled_at=now(),
        settled_result = 'void:'||v_pred.market_text WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'refund'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Void refund ('||v_pred.market_text||')', v_sim);
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
        v_pred.id, p_match_id, 'Void refund ('||v_pred.market_text||')', v_sim);
    ELSIF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions
        SET status='won', points=3, settled_at=now(), settled_result = v_score_text
        WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Win payout ('||v_pred.market_text||')', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout, v_pred.id, p_match_id,
        'Payout ('||v_pred.market_text||')', v_sim);
    ELSE
      UPDATE public.predictions
        SET status='lost', points=0, settled_at=now(), settled_result = v_score_text
        WHERE id = v_pred.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $function$;

-- 4. Expand correlation_groups so the new markets count toward the right risk buckets
UPDATE public.platform_settings
SET correlation_groups = jsonb_build_object(
  'goals_up', jsonb_build_array(
    'over_under_0_5:OVER_0_5','over_under_1_5:OVER_1_5','over_under_2_5:OVER_2_5',
    'over_under_3_5:OVER_3_5','over_under_4_5:OVER_4_5','over_under_5_5:OVER_5_5','over_under_6_5:OVER_6_5',
    'btts:YES','exact_total_goals:GOALS_3','exact_total_goals:GOALS_4','exact_total_goals:GOALS_5_PLUS'),
  'goals_down', jsonb_build_array(
    'over_under_0_5:UNDER_0_5','over_under_1_5:UNDER_1_5','over_under_2_5:UNDER_2_5',
    'over_under_3_5:UNDER_3_5','over_under_4_5:UNDER_4_5','over_under_5_5:UNDER_5_5','over_under_6_5:UNDER_6_5',
    'btts:NO','exact_total_goals:GOALS_0','exact_total_goals:GOALS_1','exact_total_goals:GOALS_2',
    'clean_sheet_home:YES','clean_sheet_away:YES'),
  'home_lean', jsonb_build_array(
    'half_time_full_time:HOME_HOME','half_time_full_time:DRAW_HOME','half_time_full_time:HOME_DRAW',
    'to_qualify:HOME','double_chance:HOME_OR_DRAW','double_chance:HOME_OR_AWAY',
    'draw_no_bet:HOME','win_to_nil_home:YES'),
  'away_lean', jsonb_build_array(
    'half_time_full_time:AWAY_AWAY','half_time_full_time:DRAW_AWAY','half_time_full_time:AWAY_DRAW',
    'to_qualify:AWAY','double_chance:DRAW_OR_AWAY','double_chance:HOME_OR_AWAY',
    'draw_no_bet:AWAY','win_to_nil_away:YES'),
  'draw_lean', jsonb_build_array('half_time_full_time:DRAW_DRAW')
), updated_at = now()
WHERE id = 1;
