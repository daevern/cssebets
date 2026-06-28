
-- 1. Platform settings: new per-user concentration caps + correlation groups
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS max_user_match_potential_payout numeric NOT NULL DEFAULT 1500,
  ADD COLUMN IF NOT EXISTS max_user_match_stake numeric NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS max_user_match_correlated_payout numeric NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS max_user_daily_potential_payout numeric NOT NULL DEFAULT 8000,
  ADD COLUMN IF NOT EXISTS correlation_groups jsonb NOT NULL DEFAULT '{
    "goals_up": [
      "over_under_2_5:OVER_2_5",
      "btts:YES",
      "exact_total_goals:GOALS_3",
      "exact_total_goals:GOALS_4",
      "exact_total_goals:GOALS_5_PLUS"
    ],
    "goals_down": [
      "over_under_2_5:UNDER_2_5",
      "btts:NO",
      "exact_total_goals:GOALS_0",
      "exact_total_goals:GOALS_1",
      "exact_total_goals:GOALS_2"
    ],
    "home_lean": [
      "half_time_full_time:HOME_HOME",
      "half_time_full_time:DRAW_HOME",
      "half_time_full_time:HOME_DRAW"
    ],
    "away_lean": [
      "half_time_full_time:AWAY_AWAY",
      "half_time_full_time:DRAW_AWAY",
      "half_time_full_time:AWAY_DRAW"
    ],
    "draw_lean": [
      "half_time_full_time:DRAW_DRAW"
    ]
  }'::jsonb;

-- 2. Profiles: per-user risk multiplier
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS risk_factor numeric NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS risk_factor_reason text,
  ADD COLUMN IF NOT EXISTS risk_factor_updated_at timestamptz;

-- 3. Helper: classify a (market,selection) into correlation groups
CREATE OR REPLACE FUNCTION public.classify_correlation_groups(
  p_market text,
  p_selection text
) RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_groups jsonb;
  v_key text := p_market || ':' || p_selection;
  v_h int; v_a int; v_total int;
  v_result text[] := ARRAY[]::text[];
  v_group_name text;
  v_arr jsonb;
BEGIN
  SELECT correlation_groups INTO v_groups FROM public.platform_settings WHERE id = 1;
  IF v_groups IS NULL THEN RETURN v_result; END IF;

  -- explicit membership
  FOR v_group_name, v_arr IN SELECT k, v FROM jsonb_each(v_groups) AS t(k,v) LOOP
    IF v_arr ? v_key THEN
      v_result := array_append(v_result, v_group_name);
    END IF;
  END LOOP;

  -- correct_score → derive goals_up / goals_down
  IF p_market = 'correct_score' AND p_selection ~ '^[0-9]+-[0-9]+$' THEN
    v_h := split_part(p_selection,'-',1)::int;
    v_a := split_part(p_selection,'-',2)::int;
    v_total := v_h + v_a;
    IF v_total >= 3 AND NOT ('goals_up' = ANY(v_result)) THEN
      v_result := array_append(v_result, 'goals_up');
    ELSIF v_total <= 2 AND NOT ('goals_down' = ANY(v_result)) THEN
      v_result := array_append(v_result, 'goals_down');
    END IF;
    IF v_h > v_a AND NOT ('home_lean' = ANY(v_result)) THEN
      v_result := array_append(v_result, 'home_lean');
    ELSIF v_a > v_h AND NOT ('away_lean' = ANY(v_result)) THEN
      v_result := array_append(v_result, 'away_lean');
    ELSE
      IF v_h = v_a AND NOT ('draw_lean' = ANY(v_result)) THEN
        v_result := array_append(v_result, 'draw_lean');
      END IF;
    END IF;
  END IF;

  -- result market HOME/DRAW/AWAY → lean groups
  IF p_market = 'result' THEN
    IF p_selection = 'HOME' THEN v_result := array_append(v_result, 'home_lean');
    ELSIF p_selection = 'AWAY' THEN v_result := array_append(v_result, 'away_lean');
    ELSIF p_selection = 'DRAW' THEN v_result := array_append(v_result, 'draw_lean');
    END IF;
  END IF;

  RETURN v_result;
END $$;

-- 4. Main pre-trade per-user risk check
CREATE OR REPLACE FUNCTION public.assert_user_match_risk(
  p_user_id uuid,
  p_match_id uuid,
  p_market text,
  p_selection text,
  p_stake numeric,
  p_odds numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s public.platform_settings;
  v_factor numeric := 1.0;
  v_new_payout numeric := ROUND(p_stake * p_odds, 2);
  v_match_stake numeric;
  v_match_payout numeric;
  v_daily_payout numeric;
  v_group text;
  v_group_payout numeric;
  v_new_groups text[];
  v_cap_match_payout numeric;
  v_cap_match_stake numeric;
  v_cap_corr_payout numeric;
  v_cap_daily numeric;
BEGIN
  IF p_match_id IS NULL THEN RETURN; END IF;
  SELECT * INTO v_s FROM public.platform_settings WHERE id = 1;
  IF v_s IS NULL THEN RETURN; END IF;

  SELECT COALESCE(risk_factor, 1.0) INTO v_factor FROM public.profiles WHERE id = p_user_id;
  IF v_factor IS NULL OR v_factor <= 0 THEN v_factor := 1.0; END IF;

  v_cap_match_payout := v_s.max_user_match_potential_payout * v_factor;
  v_cap_match_stake  := v_s.max_user_match_stake * v_factor;
  v_cap_corr_payout  := v_s.max_user_match_correlated_payout * v_factor;
  v_cap_daily        := v_s.max_user_daily_potential_payout * v_factor;

  -- per-match stake & payout sums (pending, real bets only)
  SELECT COALESCE(SUM(virtual_stake),0), COALESCE(SUM(potential_return),0)
    INTO v_match_stake, v_match_payout
    FROM public.predictions
   WHERE user_id = p_user_id
     AND match_id = p_match_id
     AND is_simulation = false
     AND status = 'pending'::public.prediction_status;

  IF v_cap_match_stake > 0 AND (v_match_stake + p_stake) > v_cap_match_stake THEN
    RAISE EXCEPTION 'USER_MATCH_STAKE_EXCEEDED';
  END IF;
  IF v_cap_match_payout > 0 AND (v_match_payout + v_new_payout) > v_cap_match_payout THEN
    RAISE EXCEPTION 'USER_MATCH_PAYOUT_EXCEEDED';
  END IF;

  -- daily payout (rolling 24h)
  SELECT COALESCE(SUM(potential_return),0) INTO v_daily_payout
    FROM public.predictions
   WHERE user_id = p_user_id
     AND is_simulation = false
     AND status = 'pending'::public.prediction_status
     AND created_at > now() - interval '24 hours';

  IF v_cap_daily > 0 AND (v_daily_payout + v_new_payout) > v_cap_daily THEN
    RAISE EXCEPTION 'USER_DAILY_PAYOUT_EXCEEDED';
  END IF;

  -- correlated-group payout
  v_new_groups := public.classify_correlation_groups(p_market, p_selection);
  IF array_length(v_new_groups, 1) IS NOT NULL AND v_cap_corr_payout > 0 THEN
    FOREACH v_group IN ARRAY v_new_groups LOOP
      SELECT COALESCE(SUM(p.potential_return), 0)
        INTO v_group_payout
        FROM public.predictions p
       WHERE p.user_id = p_user_id
         AND p.match_id = p_match_id
         AND p.is_simulation = false
         AND p.status = 'pending'::public.prediction_status
         AND v_group = ANY(public.classify_correlation_groups(
               COALESCE(p.market_text, p.market::text),
               COALESCE(p.selection_label, p.outcome)
             ));
      IF (v_group_payout + v_new_payout) > v_cap_corr_payout THEN
        RAISE EXCEPTION 'USER_CORRELATED_PAYOUT_EXCEEDED:%', v_group;
      END IF;
    END LOOP;
  END IF;
END $$;

-- 5. Hook into place_market_bet_atomic
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(p_user_id uuid, p_match_id uuid, p_market text, p_selection text, p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id uuid; v_existing uuid; v_odds numeric; v_potential numeric;
  v_match RECORD; v_sim boolean; v_settings public.platform_settings; v_snap_id uuid;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_market NOT IN ('over_under_2_5','btts','correct_score','half_time_full_time','exact_total_goals') THEN
    RAISE EXCEPTION 'unsupported market %', p_market;
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
  IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
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
      CASE p_market
        WHEN 'over_under_2_5' THEN 'total_goals'::public.prediction_market
        WHEN 'btts' THEN 'btts'::public.prediction_market
        WHEN 'correct_score' THEN 'correct_score'::public.prediction_market
        WHEN 'half_time_full_time' THEN 'first_scorer'::public.prediction_market
        WHEN 'exact_total_goals' THEN 'group_winner'::public.prediction_market
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

-- 6. Hook into place_bet_atomic (result-market path)
CREATE OR REPLACE FUNCTION public.place_bet_atomic(p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid, p_cap_pct numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1; v_existing UUID;
  v_settings public.platform_settings; v_cap_pct NUMERIC; v_caller text;
BEGIN
  v_caller := current_setting('request.jwt.claim.role', true);
  IF v_caller IS NOT NULL AND v_caller <> 'service_role' THEN
    RAISE EXCEPTION 'FORBIDDEN: place_bet_atomic is service-role only';
  END IF;
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL OR v_settings.max_potential_payout IS NULL OR v_settings.max_potential_payout <= 0 THEN
    RAISE EXCEPTION 'MAX_PAYOUT_NOT_CONFIGURED';
  END IF;
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id=p_user_id AND client_request_id=p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;
  v_potential := ROUND(p_stake * p_odds, 2);
  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status,is_simulation INTO v_match
      FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
    v_row_id := CASE WHEN v_sim THEN 2 ELSE 1 END;
  END IF;
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market::text, p_odds, v_sim);
  IF NOT v_sim AND p_match_id IS NOT NULL THEN
    PERFORM public.assert_bet_within_liability_caps(p_match_id, p_market::text, p_outcome, p_stake, p_odds);
    PERFORM public.assert_user_match_risk(p_user_id, p_match_id, p_market::text, p_outcome, p_stake, p_odds);
  END IF;
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;
  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  v_cap_pct := COALESCE(p_cap_pct, v_settings.exposure_cap_pct, 1.0);
  IF v_cap_pct <= 0 OR v_cap_pct > 1 THEN v_cap_pct := 1.0; END IF;
  IF NOT v_sim AND p_match_id IS NOT NULL
     AND p_market = 'result'::public.prediction_market
     AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h,v_d,v_a
      FROM public.predictions
     WHERE match_id=p_match_id AND market='result'::public.prediction_market
       AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h, v_d, v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id AND is_simulation = false;
    IF (v_bankroll * v_cap_pct) < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;
  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type,p_stake,
    'bet_placement'::public.wallet_ref_type,gen_random_uuid(),'Bet placed (stake_debit)', v_sim);
  BEGIN
    INSERT INTO public.predictions(
      user_id,match_id,market,outcome,reference_odds,
      reference_odds_snapshot_id,virtual_stake,potential_return,is_simulation,client_request_id)
     VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential,v_sim,p_client_request_id)
     RETURNING id INTO v_pred_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST';
  END;
  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  ELSE
    PERFORM public.platform_apply_change(
      'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, NULL,
      'Stake collected (no-match bet)', v_sim);
  END IF;
  RETURN v_pred_id;
END $function$;
