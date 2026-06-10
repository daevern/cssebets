
DO $$ BEGIN
  CREATE TYPE public.platform_txn_type AS ENUM (
    'stake_collected','payout_paid','void_refund','admin_topup','admin_withdrawal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.platform_bankroll (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  balance NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_stakes_collected NUMERIC(20,2) NOT NULL DEFAULT 0,
  total_payouts_paid NUMERIC(20,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_bankroll TO authenticated;
GRANT ALL ON public.platform_bankroll TO service_role;
ALTER TABLE public.platform_bankroll ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins can view bankroll" ON public.platform_bankroll
    FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

INSERT INTO public.platform_bankroll (id, balance) VALUES (1, 100000)
  ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.platform_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id UUID NULL REFERENCES public.predictions(id) ON DELETE SET NULL,
  match_id UUID NULL REFERENCES public.matches(id) ON DELETE SET NULL,
  transaction_type public.platform_txn_type NOT NULL,
  amount NUMERIC(20,2) NOT NULL,
  balance_before NUMERIC(20,2) NOT NULL,
  balance_after NUMERIC(20,2) NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_txn_created_idx ON public.platform_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_txn_match_idx ON public.platform_transactions(match_id);
CREATE INDEX IF NOT EXISTS platform_txn_bet_idx ON public.platform_transactions(bet_id);
GRANT SELECT ON public.platform_transactions TO authenticated;
GRANT ALL ON public.platform_transactions TO service_role;
ALTER TABLE public.platform_transactions ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Admins can view platform txns" ON public.platform_transactions
    FOR SELECT TO authenticated USING (private.has_role(auth.uid(),'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS home_liability NUMERIC(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS draw_liability NUMERIC(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS away_liability NUMERIC(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS worst_case_exposure NUMERIC(20,2) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.platform_apply_change(
  p_type public.platform_txn_type, p_amount NUMERIC,
  p_bet_id UUID DEFAULT NULL, p_match_id UUID DEFAULT NULL, p_note TEXT DEFAULT NULL
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before NUMERIC; v_after NUMERIC; v_signed NUMERIC;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'platform: amount must be positive'; END IF;
  SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=1 FOR UPDATE;
  IF v_before IS NULL THEN
    INSERT INTO public.platform_bankroll (id, balance) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
    SELECT balance INTO v_before FROM public.platform_bankroll WHERE id=1 FOR UPDATE;
  END IF;
  IF p_type IN ('stake_collected','admin_topup') THEN v_signed := p_amount;
  ELSE v_signed := -p_amount; END IF;
  v_after := v_before + v_signed;
  IF v_after < 0 THEN RAISE EXCEPTION 'PLATFORM_INSUFFICIENT_BALANCE'; END IF;
  UPDATE public.platform_bankroll
     SET balance=v_after,
         total_stakes_collected = total_stakes_collected + CASE WHEN p_type='stake_collected' THEN p_amount ELSE 0 END,
         total_payouts_paid = total_payouts_paid + CASE WHEN p_type='payout_paid' THEN p_amount ELSE 0 END,
         updated_at=now()
   WHERE id=1;
  INSERT INTO public.platform_transactions (bet_id, match_id, transaction_type, amount, balance_before, balance_after, note)
    VALUES (p_bet_id, p_match_id, p_type, p_amount, v_before, v_after, p_note);
  RETURN v_after;
END $$;
REVOKE ALL ON FUNCTION public.platform_apply_change(public.platform_txn_type, NUMERIC, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_apply_change(public.platform_txn_type, NUMERIC, UUID, UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.recalc_match_liabilities(p_match_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_h NUMERIC := 0; v_d NUMERIC := 0; v_a NUMERIC := 0;
BEGIN
  SELECT
    COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
    COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
    INTO v_h, v_d, v_a
  FROM public.predictions
  WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
  UPDATE public.matches
     SET home_liability=v_h, draw_liability=v_d, away_liability=v_a,
         worst_case_exposure=GREATEST(v_h,v_d,v_a)
   WHERE id=p_match_id;
END $$;
REVOKE ALL ON FUNCTION public.recalc_match_liabilities(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_match_liabilities(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.place_bet_atomic(
  p_user_id UUID, p_match_id UUID, p_market public.prediction_market, p_outcome TEXT,
  p_odds NUMERIC, p_stake NUMERIC, p_snapshot_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pred_id UUID; v_potential NUMERIC; v_match RECORD; v_bankroll NUMERIC;
  v_h NUMERIC; v_d NUMERIC; v_a NUMERIC; v_other_sum NUMERIC; v_new_worst NUMERIC;
BEGIN
  IF p_stake IS NULL OR p_stake <= 0 THEN RAISE EXCEPTION 'invalid stake'; END IF;
  IF p_odds  IS NULL OR p_odds  < 1 THEN RAISE EXCEPTION 'invalid odds'; END IF;
  v_potential := ROUND(p_stake * p_odds, 2);

  IF p_match_id IS NOT NULL THEN
    SELECT id, kickoff_at, status INTO v_match FROM public.matches WHERE id=p_match_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
    IF v_match.status <> 'scheduled'::public.match_status OR v_match.kickoff_at <= now() THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
  END IF;

  SELECT balance INTO v_bankroll FROM public.platform_bankroll WHERE id=1 FOR UPDATE;

  IF p_match_id IS NOT NULL AND p_market='result'::public.prediction_market AND p_outcome IN ('HOME','DRAW','AWAY') THEN
    SELECT
      COALESCE(SUM(CASE WHEN outcome='HOME' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='DRAW' THEN virtual_stake*reference_odds ELSE 0 END),0),
      COALESCE(SUM(CASE WHEN outcome='AWAY' THEN virtual_stake*reference_odds ELSE 0 END),0)
      INTO v_h, v_d, v_a
    FROM public.predictions
    WHERE match_id=p_match_id AND market='result'::public.prediction_market AND status='pending'::public.prediction_status;
    IF p_outcome='HOME' THEN v_h := v_h + v_potential;
    ELSIF p_outcome='DRAW' THEN v_d := v_d + v_potential;
    ELSE v_a := v_a + v_potential; END IF;
    v_new_worst := GREATEST(v_h, v_d, v_a);
    SELECT COALESCE(SUM(worst_case_exposure),0) INTO v_other_sum
      FROM public.matches WHERE id <> p_match_id;
    IF (v_bankroll + p_stake) < (v_other_sum + v_new_worst) THEN
      RAISE EXCEPTION 'MAX_EXPOSURE_REACHED';
    END IF;
  END IF;

  PERFORM public.wallet_apply_change(
    p_user_id, 'debit'::public.wallet_txn_type, p_stake,
    'bet_placement'::public.wallet_ref_type, gen_random_uuid(), 'Bet placed'
  );

  INSERT INTO public.predictions (
    user_id, match_id, market, outcome, reference_odds,
    reference_odds_snapshot_id, virtual_stake, potential_return
  ) VALUES (
    p_user_id, p_match_id, p_market, p_outcome, p_odds,
    p_snapshot_id, p_stake, v_potential
  ) RETURNING id INTO v_pred_id;

  PERFORM public.platform_apply_change(
    'stake_collected'::public.platform_txn_type, p_stake, v_pred_id, p_match_id, 'Stake collected'
  );

  IF p_match_id IS NOT NULL THEN
    PERFORM public.recalc_match_liabilities(p_match_id);
  END IF;
  RETURN v_pred_id;
END $$;
REVOKE ALL ON FUNCTION public.place_bet_atomic(UUID, UUID, public.prediction_market, TEXT, NUMERIC, NUMERIC, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.place_bet_atomic(UUID, UUID, public.prediction_market, TEXT, NUMERIC, NUMERIC, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_match_atomic(
  p_match_id UUID, p_home_score INT, p_away_score INT
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pred RECORD; v_settled INT := 0; v_won BOOLEAN; v_payout NUMERIC;
  v_winner TEXT; v_total INT; v_line NUMERIC; v_dir TEXT;
BEGIN
  PERFORM 1 FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;

  UPDATE public.matches
     SET status='finished'::public.match_status,
         home_score=p_home_score, away_score=p_away_score,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;

  IF p_home_score > p_away_score THEN v_winner := 'HOME';
  ELSIF p_home_score < p_away_score THEN v_winner := 'AWAY';
  ELSE v_winner := 'DRAW'; END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
    FOR UPDATE
  LOOP
    v_won := FALSE; v_payout := 0;
    IF v_pred.market='result'::public.prediction_market THEN v_won := v_pred.outcome = v_winner;
    ELSIF v_pred.market='correct_score'::public.prediction_market THEN v_won := v_pred.outcome = (p_home_score || '-' || p_away_score);
    ELSIF v_pred.market='total_goals'::public.prediction_market THEN
      v_total := p_home_score + p_away_score;
      v_dir := split_part(v_pred.outcome,'_',1);
      v_line := NULLIF(split_part(v_pred.outcome,'_',2),'')::NUMERIC;
      IF v_line IS NOT NULL THEN
        v_won := (v_dir='OVER' AND v_total>v_line) OR (v_dir='UNDER' AND v_total<v_line);
      END IF;
    ELSIF v_pred.market='btts'::public.prediction_market THEN
      v_won := (v_pred.outcome='YES' AND p_home_score>0 AND p_away_score>0)
            OR (v_pred.outcome='NO'  AND (p_home_score=0 OR p_away_score=0));
    END IF;

    IF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won'::public.prediction_status, points=3, settled_at=now() WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id, 'credit'::public.wallet_txn_type, v_payout,
        'bet_settlement'::public.wallet_ref_type, v_pred.id, 'Win payout'
      );
      PERFORM public.platform_apply_change(
        'payout_paid'::public.platform_txn_type, v_payout, v_pred.id, p_match_id, 'Payout for winning bet'
      );
    ELSE
      UPDATE public.predictions SET status='lost'::public.prediction_status, points=0, settled_at=now() WHERE id=v_pred.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;
  RETURN v_settled;
END $$;
REVOKE ALL ON FUNCTION public.settle_match_atomic(UUID, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_match_atomic(UUID, INT, INT) TO service_role;

CREATE OR REPLACE FUNCTION public.void_match_atomic(p_match_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pred RECORD; v_count INT := 0;
BEGIN
  PERFORM 1 FROM public.matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'match not found'; END IF;
  UPDATE public.matches
     SET status='cancelled'::public.match_status,
         home_liability=0, draw_liability=0, away_liability=0, worst_case_exposure=0
   WHERE id=p_match_id;
  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id=p_match_id AND status='pending'::public.prediction_status
    FOR UPDATE
  LOOP
    UPDATE public.predictions SET status='void'::public.prediction_status, settled_at=now() WHERE id=v_pred.id;
    PERFORM public.wallet_apply_change(
      v_pred.user_id, 'refund'::public.wallet_txn_type, v_pred.virtual_stake,
      'bet_settlement'::public.wallet_ref_type, v_pred.id, 'Void refund'
    );
    PERFORM public.platform_apply_change(
      'void_refund'::public.platform_txn_type, v_pred.virtual_stake, v_pred.id, p_match_id, 'Void refund'
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.void_match_atomic(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_match_atomic(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_platform_bankroll_touch ON public.platform_bankroll;
CREATE TRIGGER trg_platform_bankroll_touch
  BEFORE UPDATE ON public.platform_bankroll
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
