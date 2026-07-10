
-- UFC events
CREATE TABLE public.ufc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ufc_events TO anon, authenticated;
GRANT ALL ON public.ufc_events TO service_role;
ALTER TABLE public.ufc_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_events public read" ON public.ufc_events FOR SELECT USING (true);

-- UFC fights
CREATE TABLE public.ufc_fights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.ufc_events(id) ON DELETE CASCADE,
  odds_api_event_id text,
  fighter_a text NOT NULL,
  fighter_b text NOT NULL,
  commence_time timestamptz NOT NULL,
  card_position text NOT NULL DEFAULT 'other' CHECK (card_position IN ('main','co_main','other')),
  scheduled_rounds int NOT NULL DEFAULT 3 CHECK (scheduled_rounds IN (3,5)),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','finished','void')),
  winner text CHECK (winner IN ('a','b','draw')),
  result_method text CHECK (result_method IN ('ko_tko','submission','decision')),
  result_round int,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ufc_fights_event_idx ON public.ufc_fights(event_id);
CREATE INDEX ufc_fights_commence_idx ON public.ufc_fights(commence_time);
GRANT SELECT ON public.ufc_fights TO anon, authenticated;
GRANT ALL ON public.ufc_fights TO service_role;
ALTER TABLE public.ufc_fights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_fights public read" ON public.ufc_fights FOR SELECT USING (true);

-- UFC fight markets (current odds per selection)
CREATE TABLE public.ufc_fight_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fight_id uuid NOT NULL REFERENCES public.ufc_fights(id) ON DELETE CASCADE,
  market_type text NOT NULL CHECK (market_type IN ('moneyline','method','round')),
  selection_key text NOT NULL,
  label text NOT NULL,
  odds numeric(8,2) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fight_id, market_type, selection_key)
);
CREATE INDEX ufc_fight_markets_fight_idx ON public.ufc_fight_markets(fight_id);
GRANT SELECT ON public.ufc_fight_markets TO anon, authenticated;
GRANT ALL ON public.ufc_fight_markets TO service_role;
ALTER TABLE public.ufc_fight_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_fight_markets public read" ON public.ufc_fight_markets FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE public.ufc_fight_markets;
ALTER TABLE public.ufc_fight_markets REPLICA IDENTITY FULL;

-- UFC market history snapshots
CREATE TABLE public.ufc_market_snapshots (
  id bigserial PRIMARY KEY,
  fight_id uuid NOT NULL REFERENCES public.ufc_fights(id) ON DELETE CASCADE,
  market_type text NOT NULL,
  selection_key text NOT NULL,
  odds numeric(8,2) NOT NULL,
  sampled_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ufc_market_snapshots_fight_time ON public.ufc_market_snapshots(fight_id, sampled_at DESC);
GRANT SELECT ON public.ufc_market_snapshots TO anon, authenticated;
GRANT ALL ON public.ufc_market_snapshots TO service_role;
ALTER TABLE public.ufc_market_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_snapshots public read" ON public.ufc_market_snapshots FOR SELECT USING (true);

-- UFC bets
CREATE TABLE public.ufc_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fight_id uuid NOT NULL REFERENCES public.ufc_fights(id) ON DELETE RESTRICT,
  market_type text NOT NULL CHECK (market_type IN ('moneyline','method','round')),
  selection_key text NOT NULL,
  selection_label text NOT NULL,
  stake numeric(14,2) NOT NULL CHECK (stake > 0),
  odds_locked numeric(8,2) NOT NULL CHECK (odds_locked >= 1.01),
  potential_payout numeric(14,2) NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost','void')),
  payout numeric(14,2),
  placed_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz
);
CREATE INDEX ufc_bets_user_idx ON public.ufc_bets(user_id, placed_at DESC);
CREATE INDEX ufc_bets_fight_idx ON public.ufc_bets(fight_id);
CREATE INDEX ufc_bets_status_idx ON public.ufc_bets(status);
GRANT SELECT, INSERT ON public.ufc_bets TO authenticated;
GRANT ALL ON public.ufc_bets TO service_role;
ALTER TABLE public.ufc_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_bets read own" ON public.ufc_bets FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "ufc_bets insert own" ON public.ufc_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Atomic bet placement: debit wallet + insert bet
CREATE OR REPLACE FUNCTION public.place_ufc_bet_atomic(
  p_user_id uuid,
  p_fight_id uuid,
  p_market_type text,
  p_selection_key text,
  p_selection_label text,
  p_stake numeric,
  p_odds numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bal numeric;
  v_new_bal numeric;
  v_bet_id uuid;
  v_potential numeric;
  v_fight_status text;
  v_market_active boolean;
BEGIN
  IF p_stake <= 0 THEN RAISE EXCEPTION 'Stake must be positive'; END IF;
  IF p_odds < 1.01 THEN RAISE EXCEPTION 'Invalid odds'; END IF;

  SELECT status INTO v_fight_status FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight_status IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight_status NOT IN ('scheduled','live') THEN RAISE EXCEPTION 'Fight not open for betting'; END IF;

  SELECT is_active INTO v_market_active FROM public.ufc_fight_markets
    WHERE fight_id = p_fight_id AND market_type = p_market_type AND selection_key = p_selection_key;
  IF v_market_active IS NULL OR NOT v_market_active THEN
    RAISE EXCEPTION 'Market not available';
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id AND is_simulation = false FOR UPDATE;
  IF v_bal IS NULL THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF v_bal < p_stake THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  v_new_bal := v_bal - p_stake;
  v_potential := ROUND(p_stake * p_odds, 2);

  UPDATE public.wallets SET balance = v_new_bal, updated_at = now()
    WHERE user_id = p_user_id AND is_simulation = false;

  INSERT INTO public.ufc_bets(user_id, fight_id, market_type, selection_key, selection_label, stake, odds_locked, potential_payout)
    VALUES (p_user_id, p_fight_id, p_market_type, p_selection_key, p_selection_label, p_stake, p_odds, v_potential)
    RETURNING id INTO v_bet_id;

  INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note, transaction_category, bet_id, metadata)
    VALUES (p_user_id, 'debit', p_stake, v_bal, v_new_bal, 'bet_placement', v_bet_id, 'UFC bet placed', 'ufc_bet', v_bet_id,
            jsonb_build_object('fight_id', p_fight_id, 'market_type', p_market_type, 'selection_key', p_selection_key, 'odds', p_odds));

  RETURN v_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION public.place_ufc_bet_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_ufc_bet_atomic TO service_role;

-- Settlement: grades all open bets for a fight and credits winners
CREATE OR REPLACE FUNCTION public.settle_ufc_fight_atomic(
  p_fight_id uuid,
  p_winner text,
  p_method text,
  p_round int
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet record;
  v_bal numeric;
  v_new_bal numeric;
  v_won boolean;
  v_settled int := 0;
  v_fight record;
  v_expected_round_key text;
  v_expected_method_key text;
BEGIN
  SELECT * INTO v_fight FROM public.ufc_fights WHERE id = p_fight_id FOR UPDATE;
  IF v_fight IS NULL THEN RAISE EXCEPTION 'Fight not found'; END IF;
  IF v_fight.status = 'finished' THEN RAISE EXCEPTION 'Already settled'; END IF;

  -- Determine winning selection keys
  IF p_round >= v_fight.scheduled_rounds AND p_method = 'decision' THEN
    v_expected_round_key := 'distance';
  ELSE
    v_expected_round_key := 'r' || p_round::text;
  END IF;
  v_expected_method_key := p_winner || '_' || p_method;

  FOR v_bet IN SELECT * FROM public.ufc_bets WHERE fight_id = p_fight_id AND status = 'open' FOR UPDATE LOOP
    v_won := false;
    IF v_bet.market_type = 'moneyline' THEN
      v_won := v_bet.selection_key = p_winner;
    ELSIF v_bet.market_type = 'method' THEN
      v_won := v_bet.selection_key = v_expected_method_key;
    ELSIF v_bet.market_type = 'round' THEN
      v_won := v_bet.selection_key = v_expected_round_key;
    END IF;

    IF v_won THEN
      SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id AND is_simulation = false FOR UPDATE;
      v_new_bal := v_bal + v_bet.potential_payout;
      UPDATE public.wallets SET balance = v_new_bal, updated_at = now()
        WHERE user_id = v_bet.user_id AND is_simulation = false;
      UPDATE public.ufc_bets SET status = 'won', payout = v_bet.potential_payout, settled_at = now()
        WHERE id = v_bet.id;
      INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note, transaction_category, bet_id, metadata)
        VALUES (v_bet.user_id, 'credit', v_bet.potential_payout, v_bal, v_new_bal, 'bet_settlement', v_bet.id, 'UFC bet won', 'ufc_bet', v_bet.id,
                jsonb_build_object('fight_id', p_fight_id, 'winner', p_winner, 'method', p_method, 'round', p_round));
    ELSE
      UPDATE public.ufc_bets SET status = 'lost', payout = 0, settled_at = now() WHERE id = v_bet.id;
    END IF;
    v_settled := v_settled + 1;
  END LOOP;

  UPDATE public.ufc_fights
    SET status = 'finished', winner = p_winner, result_method = p_method, result_round = p_round, settled_at = now(), updated_at = now()
    WHERE id = p_fight_id;

  RETURN v_settled;
END;
$$;
REVOKE ALL ON FUNCTION public.settle_ufc_fight_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_ufc_fight_atomic TO service_role;

-- Void: refund all open bets on a fight
CREATE OR REPLACE FUNCTION public.void_ufc_fight_atomic(p_fight_id uuid, p_reason text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet record;
  v_bal numeric;
  v_new_bal numeric;
  v_voided int := 0;
BEGIN
  FOR v_bet IN SELECT * FROM public.ufc_bets WHERE fight_id = p_fight_id AND status = 'open' FOR UPDATE LOOP
    SELECT balance INTO v_bal FROM public.wallets WHERE user_id = v_bet.user_id AND is_simulation = false FOR UPDATE;
    v_new_bal := v_bal + v_bet.stake;
    UPDATE public.wallets SET balance = v_new_bal, updated_at = now()
      WHERE user_id = v_bet.user_id AND is_simulation = false;
    UPDATE public.ufc_bets SET status = 'void', payout = v_bet.stake, settled_at = now() WHERE id = v_bet.id;
    INSERT INTO public.wallet_transactions(user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note, transaction_category, bet_id, metadata)
      VALUES (v_bet.user_id, 'refund', v_bet.stake, v_bal, v_new_bal, 'bet_settlement', v_bet.id, 'UFC bet voided: ' || COALESCE(p_reason,''), 'ufc_bet', v_bet.id,
              jsonb_build_object('fight_id', p_fight_id, 'reason', p_reason));
    v_voided := v_voided + 1;
  END LOOP;

  UPDATE public.ufc_fights SET status = 'void', updated_at = now() WHERE id = p_fight_id;
  RETURN v_voided;
END;
$$;
REVOKE ALL ON FUNCTION public.void_ufc_fight_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_ufc_fight_atomic TO service_role;

-- updated_at trigger for tables that have it
CREATE OR REPLACE FUNCTION public.ufc_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER ufc_events_touch BEFORE UPDATE ON public.ufc_events FOR EACH ROW EXECUTE FUNCTION public.ufc_touch_updated_at();
CREATE TRIGGER ufc_fights_touch BEFORE UPDATE ON public.ufc_fights FOR EACH ROW EXECUTE FUNCTION public.ufc_touch_updated_at();

-- Seed UFC 329 event (starts_at is a placeholder; admin can edit)
INSERT INTO public.ufc_events (event_key, name, starts_at, is_active)
  VALUES ('ufc_329', 'UFC 329', now() + interval '30 days', true)
  ON CONFLICT (event_key) DO NOTHING;
