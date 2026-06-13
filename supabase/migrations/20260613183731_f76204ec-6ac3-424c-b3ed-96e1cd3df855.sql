
-- 1) Extend platform_settings with emergency controls
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS bets_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS correct_score_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_odds_disabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS high_odds_threshold numeric NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS disabled_markets text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS max_bets_per_user_per_match int NOT NULL DEFAULT 0;

-- 2) Rate limit storage
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  action text NOT NULL,
  window_start timestamptz NOT NULL,
  count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, action, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies => only SECURITY DEFINER functions + service_role can access

CREATE INDEX IF NOT EXISTS ix_rate_limits_lookup
  ON public.rate_limits (scope, action, window_start DESC);
CREATE INDEX IF NOT EXISTS ix_rate_limits_created_at
  ON public.rate_limits (created_at);

-- 3) Rate limit check function. Returns true if allowed, false if exceeded.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_scope text,
  p_action text,
  p_max int,
  p_window_seconds int
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_epoch bigint;
  v_bucket timestamptz;
  v_count int;
  v_uid uuid;
BEGIN
  IF p_scope IS NULL OR p_action IS NULL OR p_max <= 0 OR p_window_seconds <= 0 THEN
    RETURN true;
  END IF;
  v_epoch := extract(epoch from now())::bigint;
  v_bucket := to_timestamp(v_epoch - (v_epoch % p_window_seconds));

  INSERT INTO public.rate_limits(scope, action, window_start, count)
    VALUES (p_scope, p_action, v_bucket, 1)
    ON CONFLICT (scope, action, window_start)
    DO UPDATE SET count = public.rate_limits.count + 1
    RETURNING count INTO v_count;

  IF v_count > p_max THEN
    BEGIN
      v_uid := CASE WHEN p_scope LIKE 'user:%'
                    THEN substring(p_scope from 6)::uuid ELSE NULL END;
    EXCEPTION WHEN others THEN v_uid := NULL; END;
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
      VALUES (
        v_uid, 'rate_limit_triggered', 'rate_limit', NULL,
        jsonb_build_object('scope', p_scope, 'action', p_action,
                           'count', v_count, 'max', p_max,
                           'window_seconds', p_window_seconds)
      );
    RETURN false;
  END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text,text,int,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text,text,int,int) TO service_role;

-- 4) Centralised betting guard (pause, disabled markets, high-odds, per-match caps)
CREATE OR REPLACE FUNCTION public.assert_betting_allowed(
  p_user_id uuid,
  p_match_id uuid,
  p_market text,
  p_odds numeric,
  p_is_simulation boolean DEFAULT false
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings public.platform_settings;
  v_count int;
BEGIN
  IF p_is_simulation THEN RETURN; END IF;
  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;
  IF v_settings IS NULL THEN RETURN; END IF;

  IF v_settings.bets_paused THEN
    RAISE EXCEPTION 'BETTING_PAUSED';
  END IF;
  IF v_settings.correct_score_disabled AND p_market = 'correct_score' THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  IF p_market IS NOT NULL AND v_settings.disabled_markets IS NOT NULL
     AND p_market = ANY(v_settings.disabled_markets) THEN
    RAISE EXCEPTION 'MARKET_DISABLED';
  END IF;
  IF v_settings.high_odds_disabled
     AND p_odds IS NOT NULL
     AND p_odds >= COALESCE(v_settings.high_odds_threshold, 50) THEN
    RAISE EXCEPTION 'HIGH_ODDS_DISABLED';
  END IF;
  IF v_settings.max_bets_per_user_per_match > 0 AND p_match_id IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.predictions
      WHERE user_id = p_user_id
        AND match_id = p_match_id
        AND status = 'pending'::public.prediction_status;
    IF v_count >= v_settings.max_bets_per_user_per_match THEN
      RAISE EXCEPTION 'MAX_BETS_PER_MATCH';
    END IF;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.assert_betting_allowed(uuid,uuid,text,numeric,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assert_betting_allowed(uuid,uuid,text,numeric,boolean) TO service_role;

-- 5) Patch place_market_bet_atomic to invoke the guard
CREATE OR REPLACE FUNCTION public.place_market_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market text, p_selection text,
  p_stake numeric, p_client_request_id uuid DEFAULT NULL::uuid)
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
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT id,kickoff_at,status,is_simulation INTO v_match
    FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  IF v_match.status::text <> 'scheduled' OR v_match.kickoff_at <= now() THEN
    RAISE EXCEPTION 'MATCH_LOCKED';
  END IF;
  v_sim := COALESCE(v_match.is_simulation, false);

  SELECT odds INTO v_odds FROM public.match_market_odds
    WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true
    LIMIT 1;
  IF v_odds IS NULL THEN
    PERFORM public.seed_match_market_odds(p_match_id);
    SELECT odds INTO v_odds FROM public.match_market_odds
      WHERE match_id = p_match_id AND market = p_market AND selection = p_selection AND active = true LIMIT 1;
  END IF;
  IF v_odds IS NULL THEN RAISE EXCEPTION 'odds unavailable for selection'; END IF;

  -- NEW: emergency controls
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market, v_odds, v_sim);

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

-- 6) Patch place_bet_atomic to invoke the guard (insert after MATCH_LOCKED check)
CREATE OR REPLACE FUNCTION public.place_bet_atomic(p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid, p_cap_pct numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1;
  v_existing UUID;
  v_settings public.platform_settings;
  v_cap_pct NUMERIC;
  v_caller text;
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
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id LIMIT 1;
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

  -- NEW: emergency controls (market name = enum text)
  PERFORM public.assert_betting_allowed(p_user_id, p_match_id, p_market::text, p_odds, v_sim);

  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;

  v_cap_pct := COALESCE(p_cap_pct, v_settings.exposure_cap_pct, 1.0);
  IF v_cap_pct <= 0 OR v_cap_pct > 1 THEN v_cap_pct := 1.0; END IF;

  IF NOT v_sim
     AND p_match_id IS NOT NULL
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

-- 7) Extend update_platform_settings to cover new emergency fields and emit per-change audit rows.
CREATE OR REPLACE FUNCTION public.update_platform_settings(
  p_admin_id uuid, p_margin_pct numeric, p_exposure_cap_pct numeric,
  p_max_stake_per_bet numeric, p_max_potential_payout numeric,
  p_apply_margin_to_real boolean,
  p_bets_paused boolean DEFAULT NULL,
  p_correct_score_disabled boolean DEFAULT NULL,
  p_high_odds_disabled boolean DEFAULT NULL,
  p_high_odds_threshold numeric DEFAULT NULL,
  p_disabled_markets text[] DEFAULT NULL,
  p_max_bets_per_user_per_match int DEFAULT NULL
)
 RETURNS platform_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE v_old public.platform_settings; v_row public.platform_settings;
BEGIN
  IF NOT (private.has_role(p_admin_id, 'admin'::public.app_role)
       OR private.has_role(p_admin_id, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_margin_pct < 0 OR p_margin_pct > 50 THEN RAISE EXCEPTION 'margin_pct out of range'; END IF;
  IF p_exposure_cap_pct <= 0 OR p_exposure_cap_pct > 1 THEN RAISE EXCEPTION 'exposure_cap_pct must be in (0,1]'; END IF;
  IF p_max_stake_per_bet < 0 THEN RAISE EXCEPTION 'max_stake_per_bet must be >= 0'; END IF;
  IF p_max_potential_payout < 0 THEN RAISE EXCEPTION 'max_potential_payout must be >= 0'; END IF;

  SELECT * INTO v_old FROM public.platform_settings WHERE id = 1;

  UPDATE public.platform_settings
     SET margin_pct = p_margin_pct,
         exposure_cap_pct = p_exposure_cap_pct,
         max_stake_per_bet = p_max_stake_per_bet,
         max_potential_payout = p_max_potential_payout,
         apply_margin_to_real = p_apply_margin_to_real,
         bets_paused = COALESCE(p_bets_paused, bets_paused),
         correct_score_disabled = COALESCE(p_correct_score_disabled, correct_score_disabled),
         high_odds_disabled = COALESCE(p_high_odds_disabled, high_odds_disabled),
         high_odds_threshold = COALESCE(p_high_odds_threshold, high_odds_threshold),
         disabled_markets = COALESCE(p_disabled_markets, disabled_markets),
         max_bets_per_user_per_match = COALESCE(p_max_bets_per_user_per_match, max_bets_per_user_per_match),
         updated_at = now()
   WHERE id = 1
  RETURNING * INTO v_row;

  -- Specific audit entries for sensitive changes
  IF v_old.max_potential_payout IS DISTINCT FROM v_row.max_potential_payout THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
      VALUES (p_admin_id, 'max_payout_changed', 'platform_settings', NULL,
              jsonb_build_object('old', v_old.max_potential_payout, 'new', v_row.max_potential_payout));
  END IF;
  IF v_old.max_stake_per_bet IS DISTINCT FROM v_row.max_stake_per_bet THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
      VALUES (p_admin_id, 'max_stake_changed', 'platform_settings', NULL,
              jsonb_build_object('old', v_old.max_stake_per_bet, 'new', v_row.max_stake_per_bet));
  END IF;
  IF v_old.bets_paused IS DISTINCT FROM v_row.bets_paused THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
      VALUES (p_admin_id, 'betting_paused', 'platform_settings', NULL,
              jsonb_build_object('paused', v_row.bets_paused));
  END IF;
  IF v_old.disabled_markets IS DISTINCT FROM v_row.disabled_markets
     OR v_old.correct_score_disabled IS DISTINCT FROM v_row.correct_score_disabled
     OR v_old.high_odds_disabled IS DISTINCT FROM v_row.high_odds_disabled THEN
    INSERT INTO public.audit_log(user_id, action, entity, entity_id, metadata)
      VALUES (p_admin_id, 'market_disabled', 'platform_settings', NULL,
              jsonb_build_object(
                'disabled_markets', v_row.disabled_markets,
                'correct_score_disabled', v_row.correct_score_disabled,
                'high_odds_disabled', v_row.high_odds_disabled,
                'high_odds_threshold', v_row.high_odds_threshold));
  END IF;

  RETURN v_row;
END $function$;
