
-- 1) Platform settings (single row, id=1) controlling real-book risk knobs.
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id INT PRIMARY KEY DEFAULT 1,
  margin_pct NUMERIC NOT NULL DEFAULT 6.0,           -- target overround on real odds (%)
  exposure_cap_pct NUMERIC NOT NULL DEFAULT 0.6,     -- global liability cap as fraction of real bankroll (0..1)
  max_stake_per_bet NUMERIC NOT NULL DEFAULT 5000,   -- 0 = no cap
  max_potential_payout NUMERIC NOT NULL DEFAULT 50000, -- 0 = no cap
  apply_margin_to_real BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.platform_settings TO authenticated;
GRANT ALL    ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may read settings (no sensitive data); writes go through a SECURITY DEFINER server fn.
CREATE POLICY "platform_settings_read_auth"
  ON public.platform_settings FOR SELECT
  TO authenticated USING (true);

INSERT INTO public.platform_settings (id) VALUES (1)
  ON CONFLICT (id) DO NOTHING;

-- 2) Admin-only writer.
CREATE OR REPLACE FUNCTION public.update_platform_settings(
  p_admin_id uuid,
  p_margin_pct numeric,
  p_exposure_cap_pct numeric,
  p_max_stake_per_bet numeric,
  p_max_potential_payout numeric,
  p_apply_margin_to_real boolean
) RETURNS public.platform_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $function$
DECLARE v_row public.platform_settings;
BEGIN
  IF NOT (private.has_role(p_admin_id, 'admin'::public.app_role)
       OR private.has_role(p_admin_id, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF p_margin_pct < 0 OR p_margin_pct > 50 THEN RAISE EXCEPTION 'margin_pct out of range'; END IF;
  IF p_exposure_cap_pct <= 0 OR p_exposure_cap_pct > 1 THEN RAISE EXCEPTION 'exposure_cap_pct must be in (0,1]'; END IF;
  IF p_max_stake_per_bet < 0 THEN RAISE EXCEPTION 'max_stake_per_bet must be >= 0'; END IF;
  IF p_max_potential_payout < 0 THEN RAISE EXCEPTION 'max_potential_payout must be >= 0'; END IF;

  UPDATE public.platform_settings
     SET margin_pct = p_margin_pct,
         exposure_cap_pct = p_exposure_cap_pct,
         max_stake_per_bet = p_max_stake_per_bet,
         max_potential_payout = p_max_potential_payout,
         apply_margin_to_real = p_apply_margin_to_real,
         updated_at = now()
   WHERE id = 1
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

REVOKE EXECUTE ON FUNCTION public.update_platform_settings(uuid, numeric, numeric, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.update_platform_settings(uuid, numeric, numeric, numeric, numeric, boolean) TO service_role;

-- 3) Rewrite place_bet_atomic to enforce: exposure cap (real bets), per-bet max stake, max potential payout.
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid,
  p_match_id uuid,
  p_market public.prediction_market,
  p_outcome text,
  p_odds numeric,
  p_stake numeric,
  p_snapshot_id uuid DEFAULT NULL,
  p_cap_pct numeric DEFAULT NULL,
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
  v_settings public.platform_settings;
  v_cap_pct NUMERIC;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'user required'; END IF;
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;

  SELECT * INTO v_settings FROM public.platform_settings WHERE id = 1;

  -- Idempotency.
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id LIMIT 1;
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

  -- Per-bet caps apply to REAL bets only (sim flows are unconstrained).
  IF NOT v_sim AND v_settings.max_stake_per_bet > 0 AND p_stake > v_settings.max_stake_per_bet THEN
    RAISE EXCEPTION 'MAX_STAKE_EXCEEDED';
  END IF;
  IF NOT v_sim AND v_settings.max_potential_payout > 0 AND v_potential > v_settings.max_potential_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=v_row_id FOR UPDATE;

  -- Exposure cap: only for real 3-way result bets on a match.
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
    WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
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

REVOKE EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, public.prediction_market, text, numeric, numeric, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.place_bet_atomic(uuid, uuid, public.prediction_market, text, numeric, numeric, uuid, numeric, uuid) TO service_role;
