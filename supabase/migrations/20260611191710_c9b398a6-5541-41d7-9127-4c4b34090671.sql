
-- Revoke EXECUTE on privileged RPCs from anon/authenticated; keep service_role.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN (
        'place_bet_atomic','settle_match_atomic','void_match_atomic','settle_tournament_winner_atomic',
        'wallet_apply_change','platform_apply_change','pool_apply_change',
        'wallet_approve_request','wallet_reject_request',
        'payout_approve_atomic','payout_user_reject_atomic',
        'set_house_user','reset_simulation_data','update_platform_settings',
        'recalc_match_liabilities','run_simulation_tick','run_simulation_batch_settle',
        'pick_odds_weighted_score'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Data validation
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_stake_positive,
  ADD CONSTRAINT predictions_stake_positive CHECK (virtual_stake > 0);
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_odds_valid,
  ADD CONSTRAINT predictions_odds_valid CHECK (reference_odds >= 1);
ALTER TABLE public.predictions
  DROP CONSTRAINT IF EXISTS predictions_payout_nonneg,
  ADD CONSTRAINT predictions_payout_nonneg CHECK (potential_return IS NULL OR potential_return >= 0);
ALTER TABLE public.match_stake_pools
  DROP CONSTRAINT IF EXISTS match_stake_pools_nonneg,
  ADD CONSTRAINT match_stake_pools_nonneg CHECK (
    total_pool >= 0 AND home_pool >= 0 AND draw_pool >= 0 AND away_pool >= 0
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_predictions_user_created
  ON public.predictions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_match_status
  ON public.predictions (match_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_status_kickoff
  ON public.matches (status, kickoff_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_action_created
  ON public.audit_log (action, created_at DESC);

-- Tighten platform_settings read to admins.
DROP POLICY IF EXISTS platform_settings_read_auth ON public.platform_settings;
DROP POLICY IF EXISTS platform_settings_admin_read ON public.platform_settings;
CREATE POLICY platform_settings_admin_read ON public.platform_settings
  FOR SELECT USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Harden place_bet_atomic with a service-role gate.
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text,
  p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid,
  p_cap_pct numeric DEFAULT NULL::numeric, p_client_request_id uuid DEFAULT NULL::uuid)
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

  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_settings.max_potential_payout > 0 AND v_potential > v_settings.max_potential_payout THEN
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

REVOKE ALL ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(uuid,uuid,prediction_market,text,numeric,numeric,uuid,numeric,uuid)
  TO service_role;
