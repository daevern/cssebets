
-- 1) Revoke execute on internal money functions from anon/authenticated/PUBLIC.
--    Only service_role (used by trusted server functions) may call these directly.
REVOKE EXECUTE ON FUNCTION public.wallet_apply_change(uuid, public.wallet_txn_type, numeric, public.wallet_ref_type, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pool_apply_change(uuid, text, numeric, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_apply_change(public.platform_txn_type, numeric, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.platform_apply_change(public.platform_txn_type, numeric, uuid, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_simulation_tick(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_simulation_batch_settle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reset_simulation_data(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pick_odds_weighted_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_match_liabilities(uuid) FROM PUBLIC, anon, authenticated;

-- 2) Bet idempotency: optional client-supplied key to dedupe double-clicks.
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS client_request_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS predictions_user_client_req_uidx
  ON public.predictions(user_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3) Rewrite place_bet_atomic with idempotency support.
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid,
  p_match_id uuid,
  p_market public.prediction_market,
  p_outcome text,
  p_odds numeric,
  p_stake numeric,
  p_snapshot_id uuid DEFAULT NULL,
  p_cap_pct numeric DEFAULT 1.0,
  p_client_request_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1;
  v_existing UUID;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  IF p_cap_pct IS NULL OR p_cap_pct <= 0 OR p_cap_pct > 1 THEN p_cap_pct := 1.0; END IF;

  -- Idempotency short-circuit: if a prediction already exists for this client request id, return it.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id
      LIMIT 1;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  v_potential := ROUND(p_stake * p_odds, 2);

  IF p_match_id IS NOT NULL THEN
    SELECT id,kickoff_at,status,is_simulation INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
    v_sim := COALESCE(v_match.is_simulation, false);
    v_row_id := CASE WHEN v_sim THEN 2 ELSE 1 END;
  END IF;

  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;

  IF p_match_id IS NOT NULL AND p_market='result'::public.prediction_market AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h,v_d,v_a
    FROM public.predictions
    WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h,v_d,v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id AND is_simulation = v_sim;
    IF (v_bankroll * p_cap_pct) < (v_other_sum + v_new_worst) THEN
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
    -- Concurrent duplicate (same client_request_id). The other tx will succeed; raise so caller retries/reads.
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

REVOKE EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, public.prediction_market, text, numeric, numeric, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;

-- 4) Atomic payout approval (debit + status flip in one tx, idempotent via row lock + status guard).
CREATE OR REPLACE FUNCTION public.payout_approve_atomic(p_payout_id uuid, p_admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_row public.payout_requests%ROWTYPE;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'payout already %', v_row.status; END IF;
  IF v_row.user_id = p_admin_id THEN RAISE EXCEPTION 'cannot approve own payout'; END IF;

  PERFORM public.wallet_apply_change(
    v_row.user_id, 'debit'::public.wallet_txn_type, v_row.amount,
    'payout'::public.wallet_ref_type, v_row.id, 'Payout approved — points debited', false);

  UPDATE public.payout_requests
     SET status = 'approved', approved_at = now(), reviewed_by = p_admin_id
   WHERE id = p_payout_id;

  RETURN p_payout_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.payout_approve_atomic(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 5) Atomic user-side proof rejection (refund + status flip in one tx).
CREATE OR REPLACE FUNCTION public.payout_user_reject_atomic(p_payout_id uuid, p_user_id uuid, p_reason text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN RAISE EXCEPTION 'reason required'; END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;
  IF v_row.user_id <> p_user_id THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v_row.status <> 'proof_uploaded' THEN RAISE EXCEPTION 'not awaiting your decision'; END IF;

  PERFORM public.wallet_apply_change(
    v_row.user_id, 'credit'::public.wallet_txn_type, v_row.amount,
    'payout'::public.wallet_ref_type, v_row.id,
    'Payout proof rejected: ' || substr(p_reason, 1, 200), false);

  UPDATE public.payout_requests
     SET status = 'rejected_by_user',
         user_decision_at = now(),
         user_rejection_reason = p_reason
   WHERE id = p_payout_id;

  RETURN p_payout_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.payout_user_reject_atomic(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
