
-- =========================
-- 1. Add is_simulation flags
-- =========================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.predictions ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.wallet_transactions ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.platform_transactions ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_stake_pools ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.match_pool_transactions ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.point_requests ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS is_simulation boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS matches_is_sim_idx ON public.matches(is_simulation);
CREATE INDEX IF NOT EXISTS predictions_is_sim_idx ON public.predictions(is_simulation);
CREATE INDEX IF NOT EXISTS wallets_is_sim_idx ON public.wallets(is_simulation);
CREATE INDEX IF NOT EXISTS profiles_is_sim_idx ON public.profiles(is_simulation);
CREATE INDEX IF NOT EXISTS msp_is_sim_idx ON public.match_stake_pools(is_simulation);
CREATE INDEX IF NOT EXISTS pt_is_sim_idx ON public.platform_transactions(is_simulation);

-- =========================
-- 2. Allow second bankroll row (id=2 simulation)
-- =========================
ALTER TABLE public.platform_bankroll DROP CONSTRAINT IF EXISTS platform_bankroll_id_check;
ALTER TABLE public.platform_bankroll ADD CONSTRAINT platform_bankroll_id_check CHECK (id IN (1, 2));

INSERT INTO public.platform_bankroll(id, balance, total_stakes_collected, total_payouts_paid)
  VALUES (2, 1000000, 0, 0)
  ON CONFLICT (id) DO NOTHING;

-- =========================
-- 3. wallet_apply_change — add is_simulation param (last arg, default false)
-- =========================
CREATE OR REPLACE FUNCTION public.wallet_apply_change(
  p_user_id uuid,
  p_type public.wallet_txn_type,
  p_amount numeric,
  p_reference_type public.wallet_ref_type,
  p_reference_id uuid,
  p_note text DEFAULT NULL,
  p_is_simulation boolean DEFAULT false
)
RETURNS TABLE(new_balance numeric, txn_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_before NUMERIC; v_after NUMERIC; v_txn UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'wallet: amount must be positive'; END IF;
  INSERT INTO public.wallets(user_id, is_simulation) VALUES (p_user_id, p_is_simulation)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_before FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  IF p_type='debit' THEN
    v_after := v_before - p_amount;
    IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  ELSE
    v_after := v_before + p_amount;
  END IF;
  UPDATE public.wallets SET balance=v_after, updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.wallet_transactions(
    user_id,type,amount,balance_before,balance_after,reference_type,reference_id,note,is_simulation
  ) VALUES (
    p_user_id,p_type,p_amount,v_before,v_after,p_reference_type,p_reference_id,p_note,p_is_simulation
  ) RETURNING id INTO v_txn;
  new_balance := v_after; txn_id := v_txn; RETURN NEXT;
END $function$;

-- =========================
-- 4. platform_apply_change — add is_simulation param (routes to bankroll id=2)
-- =========================
CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type public.platform_txn_type,
  p_amount numeric,
  p_bet_id uuid DEFAULT NULL,
  p_match_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_is_simulation boolean DEFAULT false
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC; v_row_id INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'platform: amount must be positive'; END IF;
  v_row_id := CASE WHEN p_is_simulation THEN 2 ELSE 1 END;

  SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll(id,balance) VALUES (v_row_id,0) ON CONFLICT (id) DO NOTHING;
    SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;
  END IF;

  IF p_type IN ('stake_collected','admin_topup','match_pool_collected') THEN
    v_signed := p_amount;
  ELSE
    v_signed := -p_amount;
  END IF;

  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE'; END IF;

  UPDATE public.platform_bankroll
     SET balance=v_after,
         total_stakes_collected = total_stakes_collected
           + CASE WHEN p_type IN ('stake_collected','match_pool_collected') THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid
           + CASE WHEN p_type='payout_paid' THEN p_amount ELSE 0 END,
         updated_at=now()
   WHERE id=v_row_id;

  INSERT INTO public.platform_transactions(
    bet_id,match_id,transaction_type,amount,balance_before,balance_after,note,is_simulation
  ) VALUES (p_bet_id,p_match_id,p_type,p_amount,v_before,v_after,p_note,p_is_simulation);

  RETURN v_after;
END $function$;

-- =========================
-- 5. pool_apply_change — stamps is_simulation from match
-- =========================
CREATE OR REPLACE FUNCTION public.pool_apply_change(
  p_match_id uuid, p_outcome text, p_amount numeric, p_type text,
  p_prediction_id uuid DEFAULT NULL, p_user_id uuid DEFAULT NULL, p_desc text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC; v_sim BOOLEAN;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id=p_match_id;
  v_sim := COALESCE(v_sim, false);

  INSERT INTO public.match_stake_pools(match_id, is_simulation) VALUES (p_match_id, v_sim)
    ON CONFLICT (match_id) DO NOTHING;
  SELECT total_pool INTO v_before FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;

  IF p_type='stake_held' THEN v_signed := p_amount;
  ELSE v_signed := -p_amount; END IF;

  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'POOL_INSUFFICIENT'; END IF;

  UPDATE public.match_stake_pools
     SET total_pool=v_after,
         home_pool = home_pool + CASE WHEN p_outcome='HOME' THEN v_signed ELSE 0 END,
         draw_pool = draw_pool + CASE WHEN p_outcome='DRAW' THEN v_signed ELSE 0 END,
         away_pool = away_pool + CASE WHEN p_outcome='AWAY' THEN v_signed ELSE 0 END,
         is_simulation = v_sim,
         updated_at = now()
   WHERE match_id=p_match_id;

  INSERT INTO public.match_pool_transactions(
    match_id,prediction_id,user_id,transaction_type,amount,
    pool_balance_before,pool_balance_after,description,is_simulation)
   VALUES (p_match_id,p_prediction_id,p_user_id,p_type,p_amount,v_before,v_after,p_desc,v_sim);
  RETURN v_after;
END $function$;

-- =========================
-- 6. place_bet_atomic — sim-aware exposure & stamping
-- =========================
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market public.prediction_market,
  p_outcome text, p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
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
    IF v_bankroll < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;

  PERFORM public.wallet_apply_change(
    p_user_id,'debit'::public.wallet_txn_type,p_stake,
    'bet_placement'::public.wallet_ref_type,gen_random_uuid(),'Bet placed (stake_debit)', v_sim);

  INSERT INTO public.predictions(
    user_id,match_id,market,outcome,reference_odds,
    reference_odds_snapshot_id,virtual_stake,potential_return,is_simulation)
   VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential,v_sim)
   RETURNING id INTO v_pred_id;

  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  END IF;

  RETURN v_pred_id;
END $function$;

-- =========================
-- 7. settle_match_atomic — sim aware
-- =========================
CREATE OR REPLACE FUNCTION public.settle_match_atomic(
  p_match_id uuid, p_home_score integer, p_away_score integer
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC;
  v_winner TEXT; v_total INT; v_line NUMERIC; v_dir TEXT;
  v_pool RECORD; v_sim BOOLEAN;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  v_sim := COALESCE(v_sim, false);

  INSERT INTO public.match_stake_pools(match_id, is_simulation) VALUES (p_match_id, v_sim) ON CONFLICT (match_id) DO NOTHING;
  SELECT * INTO v_pool FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;
  IF v_pool.settled THEN RETURN 0; END IF;

  UPDATE public.matches
     SET status='finished'::public.match_status,
         home_score=p_home_score, away_score=p_away_score,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  IF v_pool.total_pool > 0 THEN
    PERFORM public.platform_apply_change(
      'match_pool_collected'::public.platform_txn_type, v_pool.total_pool,
      NULL, p_match_id, 'Pool transferred to bankroll on settlement', v_sim);
    PERFORM public.pool_apply_change(
      p_match_id, NULL, v_pool.total_pool, 'pool_transferred_to_bankroll',
      NULL, NULL, 'Pool drained to bankroll');
  END IF;

  IF p_home_score > p_away_score THEN v_winner := 'HOME';
  ELSIF p_home_score < p_away_score THEN v_winner := 'AWAY';
  ELSE v_winner := 'DRAW'; END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
    FOR UPDATE
  LOOP
    v_won := FALSE; v_payout := 0;
    IF v_pred.market='result' THEN v_won := v_pred.outcome=v_winner;
    ELSIF v_pred.market='correct_score' THEN v_won := v_pred.outcome=(p_home_score||'-'||p_away_score);
    ELSIF v_pred.market='total_goals' THEN
      v_total := p_home_score + p_away_score;
      v_dir := split_part(v_pred.outcome,'_',1);
      v_line := NULLIF(split_part(v_pred.outcome,'_',2),'')::NUMERIC;
      IF v_line IS NOT NULL THEN
        v_won := (v_dir='OVER' AND v_total>v_line) OR (v_dir='UNDER' AND v_total<v_line);
      END IF;
    ELSIF v_pred.market='btts' THEN
      v_won := (v_pred.outcome='YES' AND p_home_score>0 AND p_away_score>0)
            OR (v_pred.outcome='NO'  AND (p_home_score=0 OR p_away_score=0));
    END IF;

    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now() WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout (payout_credit)', v_sim);
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type,v_payout,v_pred.id,p_match_id,'Payout for winning bet', v_sim);
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.match_stake_pools SET settled=true, settled_at=now() WHERE match_id=p_match_id;
  RETURN v_settled;
END $function$;

-- =========================
-- 8. void_match_atomic — sim aware
-- =========================
CREATE OR REPLACE FUNCTION public.void_match_atomic(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_pred RECORD; v_count INT := 0; v_pool RECORD; v_from_pool BOOLEAN; v_sim BOOLEAN;
BEGIN
  SELECT is_simulation INTO v_sim FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  v_sim := COALESCE(v_sim, false);

  INSERT INTO public.match_stake_pools(match_id,is_simulation) VALUES (p_match_id,v_sim) ON CONFLICT (match_id) DO NOTHING;
  SELECT * INTO v_pool FROM public.match_stake_pools WHERE match_id=p_match_id FOR UPDATE;
  v_from_pool := NOT v_pool.settled;

  UPDATE public.matches
     SET status='cancelled', home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  FOR v_pred IN
    SELECT * FROM public.predictions WHERE match_id=p_match_id AND status='pending' FOR UPDATE
  LOOP
    UPDATE public.predictions SET status='void', settled_at=now() WHERE id=v_pred.id;
    PERFORM public.wallet_apply_change(
      v_pred.user_id,'refund'::public.wallet_txn_type,v_pred.virtual_stake,
      'bet_settlement'::public.wallet_ref_type,v_pred.id,'Void refund', v_sim);
    IF v_from_pool THEN
      PERFORM public.pool_apply_change(
        p_match_id, v_pred.outcome, v_pred.virtual_stake, 'void_refund_from_pool',
        v_pred.id, v_pred.user_id, 'Void refund from pool');
    ELSE
      PERFORM public.platform_apply_change(
        'void_refund'::public.platform_txn_type, v_pred.virtual_stake,
        v_pred.id, p_match_id, 'Void refund from bankroll (post-settlement)', v_sim);
    END IF;
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.match_stake_pools SET voided=true, settled=true, settled_at=COALESCE(settled_at,now())
   WHERE match_id=p_match_id;
  RETURN v_count;
END $function$;

-- =========================
-- 9. run_simulation_tick — auto-settles due simulation matches with random scores
-- =========================
CREATE OR REPLACE FUNCTION public.run_simulation_tick(p_match_duration_minutes integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_match RECORD; v_home INT; v_away INT;
  v_started INT := 0; v_settled INT := 0; v_settle_count INT;
BEGIN
  -- 1. Mark scheduled sim matches live if kickoff has passed
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE is_simulation = true AND status='scheduled'::public.match_status AND kickoff_at <= now()
    FOR UPDATE
  LOOP
    UPDATE public.matches SET status='live'::public.match_status WHERE id=v_match.id;
    v_started := v_started + 1;
  END LOOP;

  -- 2. Settle live sim matches that have reached duration
  FOR v_match IN
    SELECT id FROM public.matches
    WHERE is_simulation = true AND status='live'::public.match_status
      AND kickoff_at + (p_match_duration_minutes || ' minutes')::interval <= now()
    FOR UPDATE
  LOOP
    v_home := floor(random() * 6)::int;
    v_away := floor(random() * 6)::int;
    SELECT public.settle_match_atomic(v_match.id, v_home, v_away) INTO v_settle_count;
    v_settled := v_settled + 1;
  END LOOP;

  RETURN jsonb_build_object('started', v_started, 'settled', v_settled, 'at', now());
END $function$;

-- =========================
-- 10. reset_simulation_data — wipe ONLY is_simulation=true rows
-- =========================
CREATE OR REPLACE FUNCTION public.reset_simulation_data(p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE v_deleted jsonb := '{}'::jsonb; v_count int;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role)
     AND NOT private.has_role(p_admin_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  DELETE FROM public.match_pool_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('pool_txns', v_count);

  DELETE FROM public.match_stake_pools WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('pools', v_count);

  DELETE FROM public.platform_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('platform_txns', v_count);

  DELETE FROM public.wallet_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('wallet_txns', v_count);

  DELETE FROM public.predictions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('predictions', v_count);

  DELETE FROM public.match_odds_snapshots
   WHERE match_id IN (SELECT id FROM public.matches WHERE is_simulation=true);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('odds_snapshots', v_count);

  DELETE FROM public.matches WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('matches', v_count);

  DELETE FROM public.point_requests WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('point_requests', v_count);

  -- Reset simulation bankroll to fresh 1,000,000
  UPDATE public.platform_bankroll
     SET balance=1000000, total_stakes_collected=0, total_payouts_paid=0, updated_at=now()
   WHERE id=2;

  -- Note: simulation auth users / wallets / profiles are kept by default
  -- so the same login accounts remain usable across re-seeds.
  RETURN v_deleted;
END $function$;

GRANT EXECUTE ON FUNCTION public.run_simulation_tick(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_simulation_data(uuid) TO authenticated, service_role;
