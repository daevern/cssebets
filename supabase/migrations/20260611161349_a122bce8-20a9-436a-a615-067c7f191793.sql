
-- 1. Tournaments
CREATE TABLE public.tournaments (
  key text PRIMARY KEY,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  winner_team text,
  locks_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.tournaments TO authenticated, anon;
GRANT ALL ON public.tournaments TO service_role;

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournaments readable" ON public.tournaments
  FOR SELECT USING (true);

-- 2. Tournament outright odds
CREATE TABLE public.tournament_outrights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_key text NOT NULL REFERENCES public.tournaments(key) ON DELETE CASCADE,
  team text NOT NULL,
  odds numeric NOT NULL CHECK (odds >= 1),
  source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_key, team)
);

GRANT SELECT ON public.tournament_outrights TO authenticated, anon;
GRANT ALL ON public.tournament_outrights TO service_role;

ALTER TABLE public.tournament_outrights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tournament odds readable" ON public.tournament_outrights
  FOR SELECT USING (true);

-- 3. Seed default tournament
INSERT INTO public.tournaments (key, name)
  VALUES ('world_cup_2026', 'FIFA World Cup 2026')
  ON CONFLICT (key) DO NOTHING;

-- 4. updated_at touch trigger
CREATE TRIGGER tournaments_touch_updated_at
  BEFORE UPDATE ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER tournament_outrights_touch_updated_at
  BEFORE UPDATE ON public.tournament_outrights
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 5. Settle tournament winner
CREATE OR REPLACE FUNCTION public.settle_tournament_winner_atomic(
  p_tournament_key text,
  p_winner_team text
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC; v_status text;
BEGIN
  SELECT status INTO v_status FROM public.tournaments WHERE key = p_tournament_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament not found'; END IF;
  IF v_status = 'settled' THEN RETURN 0; END IF;

  UPDATE public.tournaments
     SET status = 'settled', winner_team = p_winner_team, settled_at = now(), updated_at = now()
   WHERE key = p_tournament_key;

  FOR v_pred IN
    SELECT * FROM public.predictions
      WHERE market = 'tournament_winner'::public.prediction_market
        AND status = 'pending'::public.prediction_status
        AND match_id IS NULL
      FOR UPDATE
  LOOP
    v_won := lower(trim(v_pred.outcome)) = lower(trim(p_winner_team));
    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now() WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Tournament winner payout',
        COALESCE(v_pred.is_simulation,false));
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout, v_pred.id, NULL,
        'Tournament winner payout', COALESCE(v_pred.is_simulation,false));
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;
  RETURN v_settled;
END $$;

REVOKE EXECUTE ON FUNCTION public.settle_tournament_winner_atomic(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_tournament_winner_atomic(text, text) TO service_role;

-- 6. Patch place_bet_atomic so tournament/no-match bets credit platform bankroll
CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id uuid, p_match_id uuid, p_market prediction_market, p_outcome text,
  p_odds numeric, p_stake numeric, p_snapshot_id uuid DEFAULT NULL::uuid,
  p_cap_pct numeric DEFAULT 1.0
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
  v_sim BOOLEAN := false; v_row_id INT := 1;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds IS NULL OR p_odds < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  IF p_cap_pct IS NULL OR p_cap_pct <= 0 OR p_cap_pct > 1 THEN p_cap_pct := 1.0; END IF;
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

  INSERT INTO public.predictions(
    user_id,match_id,market,outcome,reference_odds,
    reference_odds_snapshot_id,virtual_stake,potential_return,is_simulation)
   VALUES (p_user_id,p_match_id,p_market,p_outcome,p_odds,p_snapshot_id,p_stake,v_potential,v_sim)
   RETURNING id INTO v_pred_id;

  IF p_match_id IS NOT NULL THEN
    PERFORM public.pool_apply_change(
      p_match_id,p_outcome,p_stake,'stake_held',v_pred_id,p_user_id,'Stake held in match pool');
    PERFORM public.recalc_match_liabilities(p_match_id);
  ELSE
    -- No match attached (e.g. tournament winner). Credit stake to platform bankroll.
    PERFORM public.platform_apply_change(
      'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, NULL,
      'Stake collected (no-match bet)', v_sim);
  END IF;

  RETURN v_pred_id;
END $$;
