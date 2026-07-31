
-- ============ BLACKJACK ARCADE (score-only, non-monetary) ============

CREATE TYPE public.bj_hand_status AS ENUM ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING','COMPLETED','VOID','REVERSED','EXPIRED','ERROR');
CREATE TYPE public.bj_ph_status AS ENUM ('ACTIVE','STOOD','DOUBLED','BLACKJACK','BUST','SPLIT_ACE_LOCKED','WON','LOST','PUSH','VOID','REVERSED');
CREATE TYPE public.bj_result AS ENUM ('BLACKJACK','WIN','LOSS','PUSH','BUST','MIXED','VOID','REVERSED');
CREATE TYPE public.bj_action AS ENUM ('DEAL','HIT','STAND','DOUBLE','SPLIT','TIMEOUT_STAND','DEALER_DRAW','SETTLE');
CREATE TYPE public.bj_entry_txn AS ENUM ('daily_allocation','bonus_grant','challenge_reward','achievement_reward','consume','void_return','admin_correction','expiry');
CREATE TYPE public.bj_score_txn AS ENUM ('blackjack_result','win_result','push_result','double_result','split_result','challenge_bonus','achievement_bonus','void_reversal','admin_correction');
CREATE TYPE public.bj_shoe_status AS ENUM ('ACTIVE','NEAR_CUT','RETIRED','AWAITING_REVEAL','VERIFIED','VERIFICATION_FAILED','SUSPENDED');
CREATE TYPE public.bj_config_status AS ENUM ('draft','review','approved','scheduled','active','retired');

CREATE OR REPLACE FUNCTION public.bj_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ===== RULE CONFIG =====
CREATE TABLE public.arcade_bj_rule_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL,
  status public.bj_config_status NOT NULL DEFAULT 'draft',
  deck_count int NOT NULL DEFAULT 6,
  dealer_hits_soft_17 boolean NOT NULL DEFAULT false,
  dealer_peek boolean NOT NULL DEFAULT true,
  max_split_hands int NOT NULL DEFAULT 4,
  resplit_allowed boolean NOT NULL DEFAULT true,
  resplit_aces boolean NOT NULL DEFAULT false,
  hit_split_aces boolean NOT NULL DEFAULT false,
  double_allowed boolean NOT NULL DEFAULT true,
  double_after_split boolean NOT NULL DEFAULT true,
  auto_stand_on_21 boolean NOT NULL DEFAULT true,
  penetration numeric(4,3) NOT NULL DEFAULT 0.750,
  action_timeout_seconds int NOT NULL DEFAULT 60,
  daily_entry_allocation int NOT NULL DEFAULT 25,
  daily_hand_limit int NOT NULL DEFAULT 200,
  announcement text,
  strategy_table_version int NOT NULL DEFAULT 1,
  maintenance_mode boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid, approved_by uuid, change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
GRANT SELECT ON public.arcade_bj_rule_configs TO authenticated;
GRANT ALL ON public.arcade_bj_rule_configs TO service_role;
ALTER TABLE public.arcade_bj_rule_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_rules_read_active ON public.arcade_bj_rule_configs FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_bj_rules_touch BEFORE UPDATE ON public.arcade_bj_rule_configs FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

-- ===== SCORE CONFIG =====
CREATE TABLE public.arcade_bj_score_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version int NOT NULL,
  status public.bj_config_status NOT NULL DEFAULT 'draft',
  natural_blackjack_score int NOT NULL DEFAULT 150,
  win_score int NOT NULL DEFAULT 100,
  push_score int NOT NULL DEFAULT 25,
  loss_score int NOT NULL DEFAULT 0,
  five_card_win_score int NOT NULL DEFAULT 125,
  double_win_score int NOT NULL DEFAULT 200,
  split_win_score int NOT NULL DEFAULT 100,
  max_score_per_round int NOT NULL DEFAULT 600,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid, approved_by uuid, change_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
GRANT SELECT ON public.arcade_bj_score_configs TO authenticated;
GRANT ALL ON public.arcade_bj_score_configs TO service_role;
ALTER TABLE public.arcade_bj_score_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_scores_read_active ON public.arcade_bj_score_configs FOR SELECT TO authenticated USING (status = 'active' OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_bj_scores_touch BEFORE UPDATE ON public.arcade_bj_score_configs FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

INSERT INTO public.arcade_bj_rule_configs (name, version, status, change_reason)
VALUES ('standard', 1, 'active', 'Initial Blackjack ruleset');
INSERT INTO public.arcade_bj_score_configs (name, version, status, change_reason)
VALUES ('standard', 1, 'active', 'Initial Blackjack score table');

-- ===== SHOES (server-only content) =====
CREATE TABLE public.arcade_bj_shoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  deck_count int NOT NULL DEFAULT 6,
  total_cards int NOT NULL DEFAULT 312,
  card_order int[] NOT NULL,
  current_index int NOT NULL DEFAULT 0,
  cut_index int NOT NULL,
  status public.bj_shoe_status NOT NULL DEFAULT 'ACTIVE',
  server_seed text NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL,
  nonce int NOT NULL,
  shuffle_version int NOT NULL DEFAULT 1,
  rule_version int NOT NULL,
  revealed_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.arcade_bj_shoes TO service_role;
ALTER TABLE public.arcade_bj_shoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_shoes_service_only ON public.arcade_bj_shoes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_bj_shoes_user_status ON public.arcade_bj_shoes (user_id, status);
CREATE TRIGGER trg_bj_shoes_touch BEFORE UPDATE ON public.arcade_bj_shoes FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

-- ===== HANDS =====
CREATE TABLE public.arcade_bj_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  shoe_id uuid NOT NULL REFERENCES public.arcade_bj_shoes(id),
  status public.bj_hand_status NOT NULL DEFAULT 'CREATED',
  result public.bj_result,
  dealer_total int,
  dealer_soft boolean NOT NULL DEFAULT false,
  dealer_bust boolean NOT NULL DEFAULT false,
  dealer_blackjack boolean NOT NULL DEFAULT false,
  total_score_awarded int NOT NULL DEFAULT 0,
  rule_config_id uuid NOT NULL REFERENCES public.arcade_bj_rule_configs(id),
  rule_version int NOT NULL,
  score_config_id uuid NOT NULL REFERENCES public.arcade_bj_score_configs(id),
  score_version int NOT NULL,
  server_seed_hash text NOT NULL,
  client_seed text NOT NULL,
  nonce int NOT NULL,
  verification_id text NOT NULL DEFAULT encode(extensions.gen_random_bytes(8),'hex'),
  state_version int NOT NULL DEFAULT 1,
  action_sequence int NOT NULL DEFAULT 0,
  active_hand_index int NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  result_reason text,
  resolved_by uuid,
  resolution_reason text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_action_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 seconds',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
GRANT SELECT ON public.arcade_bj_hands TO authenticated;
GRANT ALL ON public.arcade_bj_hands TO service_role;
ALTER TABLE public.arcade_bj_hands ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_hands_own_read ON public.arcade_bj_hands FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE UNIQUE INDEX uniq_bj_active_hand_per_user ON public.arcade_bj_hands (user_id)
  WHERE status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING');
CREATE INDEX idx_bj_hands_user_created ON public.arcade_bj_hands (user_id, created_at DESC);
CREATE INDEX idx_bj_hands_status ON public.arcade_bj_hands (status);
CREATE INDEX idx_bj_hands_shoe ON public.arcade_bj_hands (shoe_id);
CREATE TRIGGER trg_bj_hands_touch BEFORE UPDATE ON public.arcade_bj_hands FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

-- ===== PLAYER HANDS =====
CREATE TABLE public.arcade_bj_player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL REFERENCES public.arcade_bj_hands(id) ON DELETE CASCADE,
  parent_player_hand_id uuid REFERENCES public.arcade_bj_player_hands(id),
  hand_index int NOT NULL,
  status public.bj_ph_status NOT NULL DEFAULT 'ACTIVE',
  result public.bj_result,
  final_total int,
  is_soft boolean NOT NULL DEFAULT false,
  is_bust boolean NOT NULL DEFAULT false,
  is_blackjack boolean NOT NULL DEFAULT false,
  is_split boolean NOT NULL DEFAULT false,
  is_split_ace boolean NOT NULL DEFAULT false,
  is_doubled boolean NOT NULL DEFAULT false,
  score_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  settled_at timestamptz,
  UNIQUE (hand_id, hand_index)
);
GRANT SELECT ON public.arcade_bj_player_hands TO authenticated;
GRANT ALL ON public.arcade_bj_player_hands TO service_role;
ALTER TABLE public.arcade_bj_player_hands ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_ph_own_read ON public.arcade_bj_player_hands FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.arcade_bj_hands h WHERE h.id = hand_id AND (h.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))));

-- ===== CARDS (face-down rows are not selectable) =====
CREATE TABLE public.arcade_bj_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shoe_id uuid NOT NULL REFERENCES public.arcade_bj_shoes(id),
  hand_id uuid NOT NULL REFERENCES public.arcade_bj_hands(id) ON DELETE CASCADE,
  player_hand_id uuid REFERENCES public.arcade_bj_player_hands(id) ON DELETE CASCADE,
  owner_type text NOT NULL CHECK (owner_type IN ('PLAYER','DEALER')),
  rank int NOT NULL CHECK (rank BETWEEN 1 AND 13),
  suit int NOT NULL CHECK (suit BETWEEN 0 AND 3),
  card_value int NOT NULL,
  shoe_position int NOT NULL,
  deal_sequence int NOT NULL,
  face_up boolean NOT NULL DEFAULT true,
  dealt_at timestamptz NOT NULL DEFAULT now(),
  revealed_at timestamptz,
  UNIQUE (shoe_id, shoe_position),
  UNIQUE (hand_id, deal_sequence)
);
GRANT SELECT ON public.arcade_bj_cards TO authenticated;
GRANT ALL ON public.arcade_bj_cards TO service_role;
ALTER TABLE public.arcade_bj_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_cards_own_faceup_read ON public.arcade_bj_cards FOR SELECT TO authenticated
USING (face_up = true AND EXISTS (SELECT 1 FROM public.arcade_bj_hands h WHERE h.id = hand_id AND (h.user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'))));
CREATE INDEX idx_bj_cards_hand ON public.arcade_bj_cards (hand_id, deal_sequence);

-- ===== ACTIONS =====
CREATE TABLE public.arcade_bj_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL REFERENCES public.arcade_bj_hands(id) ON DELETE CASCADE,
  player_hand_id uuid REFERENCES public.arcade_bj_player_hands(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  action public.bj_action NOT NULL,
  action_sequence int NOT NULL,
  state_version_before int NOT NULL,
  state_version_after int NOT NULL,
  card_id uuid REFERENCES public.arcade_bj_cards(id),
  total_before int,
  total_after int,
  idempotency_key text,
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hand_id, action_sequence)
);
CREATE UNIQUE INDEX uniq_bj_action_idem ON public.arcade_bj_actions (hand_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.arcade_bj_actions TO authenticated;
GRANT ALL ON public.arcade_bj_actions TO service_role;
ALTER TABLE public.arcade_bj_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_actions_own_read ON public.arcade_bj_actions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ===== FREE ENTRY BALANCES + LEDGER (no money, no points) =====
CREATE TABLE public.arcade_bj_entry_balances (
  user_id uuid PRIMARY KEY,
  daily_available int NOT NULL DEFAULT 0,
  daily_reset_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  bonus_available int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_bj_entry_balances TO authenticated;
GRANT ALL ON public.arcade_bj_entry_balances TO service_role;
ALTER TABLE public.arcade_bj_entry_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_entry_bal_own ON public.arcade_bj_entry_balances FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_bj_entry_bal_touch BEFORE UPDATE ON public.arcade_bj_entry_balances FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

CREATE TABLE public.arcade_bj_entry_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game text NOT NULL DEFAULT 'blackjack',
  entry_type public.bj_entry_txn NOT NULL,
  quantity int NOT NULL,
  balance_before int NOT NULL,
  balance_after int NOT NULL,
  source text,
  hand_id uuid,
  admin_id uuid,
  reason text,
  expires_at timestamptz,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_bj_entry_idem ON public.arcade_bj_entry_ledger (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.arcade_bj_entry_ledger TO authenticated;
GRANT ALL ON public.arcade_bj_entry_ledger TO service_role;
ALTER TABLE public.arcade_bj_entry_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_entry_ledger_own ON public.arcade_bj_entry_ledger FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX idx_bj_entry_ledger_user ON public.arcade_bj_entry_ledger (user_id, created_at DESC);

-- ===== SCORE BALANCES + LEDGER (non-redeemable) =====
CREATE TABLE public.arcade_bj_score_balances (
  user_id uuid PRIMARY KEY,
  total_score bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_bj_score_balances TO authenticated;
GRANT ALL ON public.arcade_bj_score_balances TO service_role;
ALTER TABLE public.arcade_bj_score_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_score_bal_read ON public.arcade_bj_score_balances FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_bj_score_bal_touch BEFORE UPDATE ON public.arcade_bj_score_balances FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

CREATE TABLE public.arcade_bj_score_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  hand_id uuid REFERENCES public.arcade_bj_hands(id) ON DELETE SET NULL,
  player_hand_id uuid,
  score_type public.bj_score_txn NOT NULL,
  score_amount int NOT NULL,
  total_before bigint NOT NULL,
  total_after bigint NOT NULL,
  score_config_version int NOT NULL,
  reason text,
  admin_id uuid,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_bj_score_idem ON public.arcade_bj_score_ledger (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
GRANT SELECT ON public.arcade_bj_score_ledger TO authenticated;
GRANT ALL ON public.arcade_bj_score_ledger TO service_role;
ALTER TABLE public.arcade_bj_score_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_score_ledger_own ON public.arcade_bj_score_ledger FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE INDEX idx_bj_score_ledger_user ON public.arcade_bj_score_ledger (user_id, created_at DESC);

-- ===== RISK FLAGS / ERRORS =====
CREATE TABLE public.arcade_bj_risk_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid, hand_id uuid, shoe_id uuid,
  flag_type text NOT NULL, severity text NOT NULL DEFAULT 'low',
  confidence numeric(4,3) NOT NULL DEFAULT 0.5,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status text NOT NULL DEFAULT 'open',
  assigned_admin uuid, resolution text, notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_bj_risk_flags TO authenticated;
GRANT ALL ON public.arcade_bj_risk_flags TO service_role;
ALTER TABLE public.arcade_bj_risk_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_risk_admin ON public.arcade_bj_risk_flags FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_bj_risk_touch BEFORE UPDATE ON public.arcade_bj_risk_flags FOR EACH ROW EXECUTE FUNCTION public.bj_touch_updated_at();

CREATE TABLE public.arcade_bj_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type text NOT NULL, severity text NOT NULL DEFAULT 'error',
  message text, user_id uuid, hand_id uuid, shoe_id uuid,
  correlation_id text, details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.arcade_bj_errors TO authenticated;
GRANT ALL ON public.arcade_bj_errors TO service_role;
ALTER TABLE public.arcade_bj_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY bj_errors_admin ON public.arcade_bj_errors FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin'));

-- ============ ENGINE ============

CREATE OR REPLACE FUNCTION public.arcade_bj_shuffle(p_server_seed text, p_client_seed text, p_nonce integer, p_n integer)
RETURNS integer[] LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  deck int[] := ARRAY(SELECT generate_series(0, p_n - 1));
  block bytea; offset_i int := 32; counter int := 0;
  i int; j int; bound bigint; limit_v bigint; r bigint; tmp int;
BEGIN
  i := p_n - 1;
  WHILE i > 0 LOOP
    bound := i + 1;
    limit_v := 4294967296 - (4294967296 % bound);
    LOOP
      IF offset_i > 28 THEN
        block := extensions.hmac(p_client_seed || ':' || p_nonce::text || ':' || counter::text, p_server_seed, 'sha256');
        counter := counter + 1; offset_i := 0;
      END IF;
      r := (get_byte(block, offset_i)::bigint << 24) | (get_byte(block, offset_i+1)::bigint << 16)
         | (get_byte(block, offset_i+2)::bigint << 8) | get_byte(block, offset_i+3)::bigint;
      offset_i := offset_i + 4;
      EXIT WHEN r < limit_v;
    END LOOP;
    j := (r % bound)::int;
    tmp := deck[i+1]; deck[i+1] := deck[j+1]; deck[j+1] := tmp;
    i := i - 1;
  END LOOP;
  RETURN deck;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_value(p_ranks integer[])
RETURNS integer[] LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE total int := 0; aces int := 0; r int; soft int := 0;
BEGIN
  FOREACH r IN ARRAY coalesce(p_ranks, '{}'::int[]) LOOP
    IF r = 1 THEN aces := aces + 1; total := total + 11;
    ELSIF r >= 10 THEN total := total + 10;
    ELSE total := total + r; END IF;
  END LOOP;
  WHILE total > 21 AND aces > 0 LOOP total := total - 10; aces := aces - 1; END LOOP;
  IF aces > 0 THEN soft := 1; END IF;
  RETURN ARRAY[total, soft, CASE WHEN total > 21 THEN 1 ELSE 0 END];
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_ensure_entries(p_user uuid)
RETURNS public.arcade_bj_entry_balances LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE b public.arcade_bj_entry_balances; alloc int; today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT daily_entry_allocation INTO alloc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  alloc := coalesce(alloc, 25);
  SELECT * INTO b FROM public.arcade_bj_entry_balances WHERE user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.arcade_bj_entry_balances(user_id, daily_available, daily_reset_date)
      VALUES (p_user, alloc, today) RETURNING * INTO b;
    INSERT INTO public.arcade_bj_entry_ledger(user_id, entry_type, quantity, balance_before, balance_after, source, idempotency_key)
      VALUES (p_user, 'daily_allocation', alloc, 0, alloc, 'auto', 'daily:'||p_user::text||':'||today::text)
      ON CONFLICT DO NOTHING;
  ELSIF b.daily_reset_date < today THEN
    INSERT INTO public.arcade_bj_entry_ledger(user_id, entry_type, quantity, balance_before, balance_after, source, idempotency_key)
      VALUES (p_user, 'daily_allocation', alloc - b.daily_available, b.daily_available, alloc, 'auto', 'daily:'||p_user::text||':'||today::text)
      ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_entry_balances SET daily_available = alloc, daily_reset_date = today
      WHERE user_id = p_user RETURNING * INTO b;
  END IF;
  RETURN b;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_draw(p_hand uuid, p_player_hand uuid, p_owner text, p_face_up boolean)
RETURNS public.arcade_bj_cards LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; s public.arcade_bj_shoes; code int; pos int; seq int; c public.arcade_bj_cards;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand;
  SELECT * INTO s FROM public.arcade_bj_shoes WHERE id = h.shoe_id FOR UPDATE;
  IF s.current_index >= s.total_cards THEN RAISE EXCEPTION 'SHOE_EXHAUSTED'; END IF;
  pos := s.current_index;
  code := s.card_order[pos + 1];
  UPDATE public.arcade_bj_shoes SET current_index = current_index + 1,
    status = CASE WHEN current_index + 1 >= cut_index THEN 'NEAR_CUT'::public.bj_shoe_status ELSE status END
    WHERE id = s.id;
  SELECT coalesce(max(deal_sequence), 0) + 1 INTO seq FROM public.arcade_bj_cards WHERE hand_id = p_hand;
  INSERT INTO public.arcade_bj_cards(shoe_id, hand_id, player_hand_id, owner_type, rank, suit, card_value, shoe_position, deal_sequence, face_up, revealed_at)
  VALUES (s.id, p_hand, p_player_hand, p_owner, (code % 13) + 1, (code / 13) % 4,
          CASE WHEN (code % 13) + 1 = 1 THEN 11 WHEN (code % 13) + 1 >= 10 THEN 10 ELSE (code % 13) + 1 END,
          pos, seq, p_face_up, CASE WHEN p_face_up THEN now() ELSE NULL END)
  RETURNING * INTO c;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_settle(p_hand uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  h public.arcade_bj_hands; sc public.arcade_bj_score_configs; rc public.arcade_bj_rule_configs;
  dranks int[]; v int[]; ph record; pranks int[]; pv int[]; pcards int;
  pts int; total_pts int := 0; res public.bj_result; overall public.bj_result;
  results text[] := '{}'; bal bigint; any_live boolean;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id = p_hand FOR UPDATE;
  IF h.status IN ('COMPLETED','VOID','REVERSED') THEN RETURN; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE id = h.score_config_id;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id = h.rule_config_id;

  UPDATE public.arcade_bj_hands SET status='DEALER_TURN' WHERE id = p_hand;
  UPDATE public.arcade_bj_cards SET face_up = true, revealed_at = now()
    WHERE hand_id = p_hand AND owner_type='DEALER' AND face_up = false;

  SELECT EXISTS(SELECT 1 FROM public.arcade_bj_player_hands
                WHERE hand_id=p_hand AND status NOT IN ('BUST','LOST')) INTO any_live;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
    FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
  v := public.arcade_bj_value(dranks);
  IF any_live AND NOT h.dealer_blackjack THEN
    WHILE v[1] < 17 OR (v[1] = 17 AND v[2] = 1 AND rc.dealer_hits_soft_17) LOOP
      PERFORM public.arcade_bj_draw(p_hand, NULL, 'DEALER', true);
      SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks
        FROM public.arcade_bj_cards WHERE hand_id=p_hand AND owner_type='DEALER';
      v := public.arcade_bj_value(dranks);
    END LOOP;
  END IF;

  UPDATE public.arcade_bj_hands
    SET status='SETTLING', dealer_total=v[1], dealer_soft=(v[2]=1), dealer_bust=(v[3]=1)
    WHERE id = p_hand;

  FOR ph IN SELECT * FROM public.arcade_bj_player_hands WHERE hand_id=p_hand ORDER BY hand_index LOOP
    SELECT array_agg(rank ORDER BY deal_sequence), count(*) INTO pranks, pcards
      FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
    pv := public.arcade_bj_value(pranks);
    pts := sc.loss_score;

    IF pv[3] = 1 THEN res := 'BUST';
    ELSIF ph.is_blackjack AND NOT h.dealer_blackjack THEN res := 'BLACKJACK';
    ELSIF ph.is_blackjack AND h.dealer_blackjack THEN res := 'PUSH';
    ELSIF h.dealer_blackjack THEN res := 'LOSS';
    ELSIF v[3] = 1 THEN res := 'WIN';
    ELSIF pv[1] > v[1] THEN res := 'WIN';
    ELSIF pv[1] = v[1] THEN res := 'PUSH';
    ELSE res := 'LOSS';
    END IF;

    IF res = 'BLACKJACK' THEN pts := sc.natural_blackjack_score;
    ELSIF res = 'WIN' THEN
      IF ph.is_doubled THEN pts := sc.double_win_score;
      ELSIF pcards >= 5 THEN pts := sc.five_card_win_score;
      ELSIF ph.is_split THEN pts := sc.split_win_score;
      ELSE pts := sc.win_score; END IF;
    ELSIF res = 'PUSH' THEN pts := sc.push_score;
    ELSE pts := sc.loss_score;
    END IF;

    total_pts := total_pts + pts;
    results := results || res::text;
    UPDATE public.arcade_bj_player_hands
      SET status = CASE res WHEN 'BUST' THEN 'BUST'::public.bj_ph_status
                            WHEN 'PUSH' THEN 'PUSH'::public.bj_ph_status
                            WHEN 'LOSS' THEN 'LOST'::public.bj_ph_status
                            ELSE 'WON'::public.bj_ph_status END,
          result = res, final_total = pv[1], is_soft = (pv[2]=1), is_bust = (pv[3]=1),
          score_awarded = pts, settled_at = now()
      WHERE id = ph.id;
  END LOOP;

  IF total_pts > sc.max_score_per_round THEN total_pts := sc.max_score_per_round; END IF;

  IF array_length(results,1) = 1 OR (SELECT count(DISTINCT x) FROM unnest(results) x) = 1 THEN
    overall := results[1]::public.bj_result;
  ELSE overall := 'MIXED'; END IF;

  INSERT INTO public.arcade_bj_score_balances(user_id, total_score) VALUES (h.user_id, 0)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT total_score INTO bal FROM public.arcade_bj_score_balances WHERE user_id = h.user_id FOR UPDATE;
  IF total_pts > 0 THEN
    INSERT INTO public.arcade_bj_score_ledger(user_id, hand_id, score_type, score_amount,
      total_before, total_after, score_config_version, reason, idempotency_key)
    VALUES (h.user_id, p_hand,
      CASE WHEN overall='BLACKJACK' THEN 'blackjack_result'::public.bj_score_txn
           WHEN overall='PUSH' THEN 'push_result'::public.bj_score_txn
           ELSE 'win_result'::public.bj_score_txn END,
      total_pts, bal, bal + total_pts, h.score_version, 'settlement', 'settle:'||p_hand::text)
    ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_score_balances SET total_score = bal + total_pts WHERE user_id = h.user_id;
  END IF;

  UPDATE public.arcade_bj_hands
    SET status='COMPLETED', result=overall, total_score_awarded=total_pts,
        settled_at=now(), last_action_at=now(), state_version = state_version + 1,
        result_reason = 'Dealer ' || v[1]::text
    WHERE id = p_hand;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_start_hand(p_user uuid, p_client_seed text, p_idempotency_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  rc public.arcade_bj_rule_configs; sc public.arcade_bj_score_configs;
  b public.arcade_bj_entry_balances; s public.arcade_bj_shoes;
  h public.arcade_bj_hands; ph public.arcade_bj_player_hands;
  v_existing uuid; v_seed text; v_nonce int; n int; v_today int;
  pranks int[]; pv int[]; dranks int[]; dv int[]; up int;
  use_bonus boolean := false; before_bal int; after_bal int;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
  IF p_client_seed IS NULL OR length(p_client_seed) < 4 OR length(p_client_seed) > 128 THEN RAISE EXCEPTION 'INVALID_CLIENT_SEED'; END IF;

  SELECT id INTO v_existing FROM public.arcade_bj_hands WHERE user_id=p_user AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN v_existing; END IF;

  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;
  IF rc.maintenance_mode THEN RAISE EXCEPTION 'MAINTENANCE_MODE'; END IF;
  SELECT * INTO sc FROM public.arcade_bj_score_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  SELECT count(*) INTO v_today FROM public.arcade_bj_hands
    WHERE user_id=p_user AND created_at >= date_trunc('day', now());
  IF v_today >= rc.daily_hand_limit THEN RAISE EXCEPTION 'DAILY_LIMIT'; END IF;

  IF EXISTS (SELECT 1 FROM public.arcade_bj_hands WHERE user_id=p_user
             AND status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING')) THEN
    RAISE EXCEPTION 'ACTIVE_HAND_EXISTS';
  END IF;

  b := public.arcade_bj_ensure_entries(p_user);
  IF b.daily_available < 1 AND b.bonus_available < 1 THEN RAISE EXCEPTION 'NO_ENTRIES'; END IF;
  use_bonus := (b.daily_available < 1);

  SELECT * INTO s FROM public.arcade_bj_shoes
    WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT') AND current_index < cut_index
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.arcade_bj_shoes SET status='AWAITING_REVEAL', retired_at=now()
      WHERE user_id=p_user AND status IN ('ACTIVE','NEAR_CUT');
    v_seed := encode(extensions.gen_random_bytes(32),'hex');
    SELECT coalesce(max(nonce),0) + 1 INTO v_nonce FROM public.arcade_bj_shoes WHERE user_id=p_user;
    n := rc.deck_count * 52;
    INSERT INTO public.arcade_bj_shoes(user_id, deck_count, total_cards, card_order, cut_index,
      server_seed, server_seed_hash, client_seed, nonce, rule_version)
    VALUES (p_user, rc.deck_count, n,
      (SELECT array_agg(x % 52 ORDER BY ord)
         FROM unnest(public.arcade_bj_shuffle(v_seed, p_client_seed, v_nonce, n)) WITH ORDINALITY AS t(x, ord)),
      floor(n * rc.penetration)::int, v_seed, encode(extensions.digest(v_seed,'sha256'),'hex'),
      p_client_seed, v_nonce, rc.version)
    RETURNING * INTO s;
  END IF;

  INSERT INTO public.arcade_bj_hands(user_id, shoe_id, status, rule_config_id, rule_version,
    score_config_id, score_version, server_seed_hash, client_seed, nonce, idempotency_key, expires_at)
  VALUES (p_user, s.id, 'DEALING', rc.id, rc.version, sc.id, sc.version,
    s.server_seed_hash, s.client_seed, s.nonce, p_idempotency_key,
    now() + make_interval(secs => rc.action_timeout_seconds))
  RETURNING * INTO h;

  before_bal := CASE WHEN use_bonus THEN b.bonus_available ELSE b.daily_available END;
  after_bal := before_bal - 1;
  IF use_bonus THEN UPDATE public.arcade_bj_entry_balances SET bonus_available = after_bal WHERE user_id=p_user;
  ELSE UPDATE public.arcade_bj_entry_balances SET daily_available = after_bal WHERE user_id=p_user; END IF;
  INSERT INTO public.arcade_bj_entry_ledger(user_id, entry_type, quantity, balance_before, balance_after, source, hand_id, reason, idempotency_key)
  VALUES (p_user, 'consume', -1, before_bal, after_bal, CASE WHEN use_bonus THEN 'bonus' ELSE 'daily' END, h.id, 'hand start', 'consume:'||h.id::text)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.arcade_bj_player_hands(hand_id, hand_index) VALUES (h.id, 0) RETURNING * INTO ph;

  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', true);
  PERFORM public.arcade_bj_draw(h.id, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(h.id, NULL, 'DEALER', false);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO pranks FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  pv := public.arcade_bj_value(pranks);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO dranks FROM public.arcade_bj_cards WHERE hand_id=h.id AND owner_type='DEALER';
  dv := public.arcade_bj_value(dranks);
  up := dranks[1];

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_after, source)
  VALUES (h.id, ph.id, p_user, 'DEAL', 1, 1, 2, pv[1], 'system');
  UPDATE public.arcade_bj_hands SET action_sequence=1, state_version=2, status='PLAYER_TURN' WHERE id=h.id;

  IF pv[1] = 21 THEN
    UPDATE public.arcade_bj_player_hands SET is_blackjack=true, status='BLACKJACK', final_total=21 WHERE id=ph.id;
  END IF;

  IF rc.dealer_peek AND (up = 1 OR up >= 10) AND dv[1] = 21 THEN
    UPDATE public.arcade_bj_hands SET dealer_blackjack=true WHERE id=h.id;
    PERFORM public.arcade_bj_settle(h.id);
  ELSIF pv[1] = 21 THEN
    PERFORM public.arcade_bj_settle(h.id);
  END IF;

  RETURN h.id;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_hit(p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  ranks int[]; pv int[]; before_total int; c public.arcade_bj_cards;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  before_total := (public.arcade_bj_value(ranks))[1];

  c := public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  pv := public.arcade_bj_value(ranks);

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, card_id, total_before, total_after, idempotency_key)
  VALUES (p_hand, ph.id, p_user, 'HIT', h.action_sequence+1, h.state_version, h.state_version+1, c.id, before_total, pv[1], p_idempotency_key);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1, last_action_at=now(),
    expires_at = now() + make_interval(secs => rc.action_timeout_seconds) WHERE id=p_hand;

  IF pv[3] = 1 THEN
    UPDATE public.arcade_bj_player_hands SET status='BUST', is_bust=true, final_total=pv[1] WHERE id=ph.id;
  ELSIF pv[1] = 21 AND rc.auto_stand_on_21 THEN
    UPDATE public.arcade_bj_player_hands SET status='STOOD', final_total=pv[1] WHERE id=ph.id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_stand(p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; ranks int[]; pv int[];
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  pv := public.arcade_bj_value(ranks);
  UPDATE public.arcade_bj_player_hands SET status='STOOD', final_total=pv[1], is_soft=(pv[2]=1) WHERE id=ph.id;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_before, total_after, idempotency_key)
  VALUES (p_hand, ph.id, p_user, 'STAND', h.action_sequence+1, h.state_version, h.state_version+1, pv[1], pv[1], p_idempotency_key);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1, last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_double(p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  ranks int[]; pv int[]; before_total int; c public.arcade_bj_cards; ncards int;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;
  IF NOT rc.double_allowed THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF ph.is_split AND NOT rc.double_after_split THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT count(*) INTO ncards FROM public.arcade_bj_cards WHERE player_hand_id = ph.id;
  IF ncards <> 2 THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  UPDATE public.arcade_bj_player_hands SET is_doubled = true WHERE id = ph.id;

  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  before_total := (public.arcade_bj_value(ranks))[1];
  c := public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  SELECT array_agg(rank ORDER BY deal_sequence) INTO ranks FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  pv := public.arcade_bj_value(ranks);

  UPDATE public.arcade_bj_player_hands
    SET status = CASE WHEN pv[3]=1 THEN 'BUST'::public.bj_ph_status ELSE 'DOUBLED'::public.bj_ph_status END,
        is_bust = (pv[3]=1), final_total = pv[1], is_soft = (pv[2]=1)
    WHERE id = ph.id;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, card_id, total_before, total_after, idempotency_key)
  VALUES (p_hand, ph.id, p_user, 'DOUBLE', h.action_sequence+1, h.state_version, h.state_version+1,
    c.id, before_total, pv[1], p_idempotency_key);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1,
    last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_split(p_user uuid, p_hand uuid, p_player_hand uuid, p_state_version int, p_idempotency_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; ph public.arcade_bj_player_hands; rc public.arcade_bj_rule_configs;
  cards public.arcade_bj_cards[]; c1 public.arcade_bj_cards; c2 public.arcade_bj_cards;
  new_ph public.arcade_bj_player_hands; nhands int; nextidx int; is_ace boolean;
  r1 int[]; r2 int[]; v1 int[]; v2 int[];
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND OR h.user_id <> p_user THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF EXISTS (SELECT 1 FROM public.arcade_bj_actions WHERE hand_id=p_hand AND idempotency_key=p_idempotency_key) THEN RETURN; END IF;
  IF h.status <> 'PLAYER_TURN' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF p_state_version IS NOT NULL AND p_state_version <> h.state_version THEN RAISE EXCEPTION 'STALE_STATE'; END IF;

  SELECT * INTO ph FROM public.arcade_bj_player_hands WHERE id=p_player_hand AND hand_id=p_hand FOR UPDATE;
  IF NOT FOUND OR ph.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  SELECT * INTO rc FROM public.arcade_bj_rule_configs WHERE id=h.rule_config_id;

  SELECT count(*) INTO nhands FROM public.arcade_bj_player_hands WHERE hand_id=p_hand;
  IF nhands >= rc.max_split_hands THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  IF ph.is_split AND NOT rc.resplit_allowed THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT array_agg(c ORDER BY c.deal_sequence) INTO cards
    FROM public.arcade_bj_cards c WHERE c.player_hand_id = ph.id;
  IF array_length(cards,1) <> 2 THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  c1 := cards[1]; c2 := cards[2];
  IF least(c1.rank,10) <> least(c2.rank,10) THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;
  is_ace := (c1.rank = 1);
  IF is_ace AND ph.is_split AND NOT rc.resplit_aces THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED'; END IF;

  SELECT coalesce(max(hand_index),0) + 1 INTO nextidx FROM public.arcade_bj_player_hands WHERE hand_id=p_hand;
  INSERT INTO public.arcade_bj_player_hands(hand_id, parent_player_hand_id, hand_index, is_split, is_split_ace)
    VALUES (p_hand, ph.id, nextidx, true, is_ace) RETURNING * INTO new_ph;
  UPDATE public.arcade_bj_player_hands SET is_split = true, is_split_ace = is_ace, is_blackjack = false WHERE id = ph.id;

  UPDATE public.arcade_bj_cards SET player_hand_id = new_ph.id WHERE id = c2.id;

  PERFORM public.arcade_bj_draw(p_hand, ph.id, 'PLAYER', true);
  PERFORM public.arcade_bj_draw(p_hand, new_ph.id, 'PLAYER', true);

  SELECT array_agg(rank ORDER BY deal_sequence) INTO r1 FROM public.arcade_bj_cards WHERE player_hand_id=ph.id;
  SELECT array_agg(rank ORDER BY deal_sequence) INTO r2 FROM public.arcade_bj_cards WHERE player_hand_id=new_ph.id;
  v1 := public.arcade_bj_value(r1); v2 := public.arcade_bj_value(r2);
  UPDATE public.arcade_bj_player_hands SET final_total=v1[1], is_soft=(v1[2]=1) WHERE id=ph.id;
  UPDATE public.arcade_bj_player_hands SET final_total=v2[1], is_soft=(v2[2]=1) WHERE id=new_ph.id;

  IF is_ace AND NOT rc.hit_split_aces THEN
    UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id IN (ph.id, new_ph.id);
  ELSE
    IF v1[1] = 21 AND rc.auto_stand_on_21 THEN UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id=ph.id; END IF;
    IF v2[1] = 21 AND rc.auto_stand_on_21 THEN UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE id=new_ph.id; END IF;
  END IF;

  INSERT INTO public.arcade_bj_actions(hand_id, player_hand_id, user_id, action, action_sequence,
    state_version_before, state_version_after, total_before, total_after, idempotency_key)
  VALUES (p_hand, ph.id, p_user, 'SPLIT', h.action_sequence+1, h.state_version, h.state_version+1,
    v1[1], v1[1], p_idempotency_key);
  UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1,
    last_action_at=now() WHERE id=p_hand;

  IF NOT EXISTS (SELECT 1 FROM public.arcade_bj_player_hands WHERE hand_id=p_hand AND status='ACTIVE') THEN
    PERFORM public.arcade_bj_settle(p_hand);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_expire_hands()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; n int := 0;
BEGIN
  FOR r IN SELECT * FROM public.arcade_bj_hands WHERE status='PLAYER_TURN' AND expires_at < now() LIMIT 200 LOOP
    UPDATE public.arcade_bj_player_hands SET status='STOOD' WHERE hand_id=r.id AND status='ACTIVE';
    INSERT INTO public.arcade_bj_actions(hand_id, user_id, action, action_sequence, state_version_before, state_version_after, source)
      VALUES (r.id, r.user_id, 'TIMEOUT_STAND', r.action_sequence+1, r.state_version, r.state_version+1, 'system');
    UPDATE public.arcade_bj_hands SET action_sequence=action_sequence+1, state_version=state_version+1 WHERE id=r.id;
    PERFORM public.arcade_bj_settle(r.id);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_admin_resolve_hand(p_admin uuid, p_hand uuid, p_action text, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; bal bigint;
BEGIN
  IF NOT (public.has_role(p_admin,'admin') OR public.has_role(p_admin,'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_action NOT IN ('VOID','REVERSE') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 4 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF h.status IN ('VOID','REVERSED') THEN RAISE EXCEPTION 'ALREADY_RESOLVED'; END IF;

  IF h.total_score_awarded > 0 THEN
    SELECT total_score INTO bal FROM public.arcade_bj_score_balances WHERE user_id=h.user_id FOR UPDATE;
    bal := coalesce(bal, 0);
    INSERT INTO public.arcade_bj_score_ledger(user_id, hand_id, score_type, score_amount,
      total_before, total_after, score_config_version, reason, admin_id, idempotency_key)
    VALUES (h.user_id, p_hand, 'void_reversal', -h.total_score_awarded, bal,
      greatest(bal - h.total_score_awarded, 0), h.score_version, p_reason, p_admin,
      'resolve:'||p_hand::text)
    ON CONFLICT DO NOTHING;
    UPDATE public.arcade_bj_score_balances SET total_score = greatest(bal - h.total_score_awarded, 0)
      WHERE user_id = h.user_id;
  END IF;

  UPDATE public.arcade_bj_player_hands
    SET status = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_ph_status ELSE 'REVERSED'::public.bj_ph_status END
    WHERE hand_id = p_hand;
  UPDATE public.arcade_bj_hands
    SET status = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_hand_status ELSE 'REVERSED'::public.bj_hand_status END,
        result = CASE WHEN p_action='VOID' THEN 'VOID'::public.bj_result ELSE 'REVERSED'::public.bj_result END,
        total_score_awarded = 0,
        resolved_by = p_admin, resolution_reason = p_reason,
        state_version = state_version + 1, settled_at = coalesce(settled_at, now())
    WHERE id = p_hand;

  PERFORM public.create_audit_log('arcade_bj_hands', p_hand::text, 'resolve',
    jsonb_build_object('action', p_action, 'reason', p_reason), p_admin);
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_publish_rule_config(p_admin uuid, p_patch jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur public.arcade_bj_rule_configs; nid uuid;
BEGIN
  IF NOT (public.has_role(p_admin,'admin') OR public.has_role(p_admin,'super_admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 4 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO cur FROM public.arcade_bj_rule_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  INSERT INTO public.arcade_bj_rule_configs(
    name, version, status, deck_count, dealer_hits_soft_17, dealer_peek, max_split_hands,
    resplit_allowed, resplit_aces, hit_split_aces, double_allowed, double_after_split,
    auto_stand_on_21, penetration, action_timeout_seconds, strategy_table_version,
    maintenance_mode, daily_entry_allocation, daily_hand_limit, announcement,
    effective_from, created_by, approved_by, change_reason)
  VALUES (
    cur.name, cur.version + 1, 'active', cur.deck_count,
    coalesce((p_patch->>'dealer_hits_soft_17')::boolean, cur.dealer_hits_soft_17),
    coalesce((p_patch->>'dealer_peek')::boolean, cur.dealer_peek),
    coalesce((p_patch->>'max_split_hands')::int, cur.max_split_hands),
    coalesce((p_patch->>'resplit_allowed')::boolean, cur.resplit_allowed),
    coalesce((p_patch->>'resplit_aces')::boolean, cur.resplit_aces),
    coalesce((p_patch->>'hit_split_aces')::boolean, cur.hit_split_aces),
    coalesce((p_patch->>'double_allowed')::boolean, cur.double_allowed),
    coalesce((p_patch->>'double_after_split')::boolean, cur.double_after_split),
    coalesce((p_patch->>'auto_stand_on_21')::boolean, cur.auto_stand_on_21),
    cur.penetration,
    coalesce((p_patch->>'action_timeout_seconds')::int, cur.action_timeout_seconds),
    cur.strategy_table_version,
    coalesce((p_patch->>'maintenance_mode')::boolean, cur.maintenance_mode),
    coalesce((p_patch->>'daily_entry_allocation')::int, cur.daily_entry_allocation),
    coalesce((p_patch->>'daily_hand_limit')::int, cur.daily_hand_limit),
    coalesce(p_patch->>'announcement', cur.announcement),
    now(), p_admin, p_admin, p_reason)
  RETURNING id INTO nid;

  UPDATE public.arcade_bj_rule_configs SET status='retired', effective_to=now() WHERE id = cur.id;
  PERFORM public.create_audit_log('arcade_bj_rule_configs', nid::text, 'publish', p_patch, p_admin);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_publish_score_config(p_admin uuid, p_patch jsonb, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cur public.arcade_bj_score_configs; nid uuid;
BEGIN
  IF NOT (public.has_role(p_admin,'admin') OR public.has_role(p_admin,'super_admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 4 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  SELECT * INTO cur FROM public.arcade_bj_score_configs WHERE status='active' ORDER BY version DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_CONFIGURED'; END IF;

  INSERT INTO public.arcade_bj_score_configs(
    name, version, status, natural_blackjack_score, win_score, push_score, loss_score,
    five_card_win_score, double_win_score, split_win_score, max_score_per_round,
    effective_from, created_by, approved_by, change_reason)
  VALUES (cur.name, cur.version + 1, 'active',
    coalesce((p_patch->>'natural_blackjack_score')::int, cur.natural_blackjack_score),
    coalesce((p_patch->>'win_score')::int, cur.win_score),
    coalesce((p_patch->>'push_score')::int, cur.push_score),
    coalesce((p_patch->>'loss_score')::int, cur.loss_score),
    coalesce((p_patch->>'five_card_win_score')::int, cur.five_card_win_score),
    coalesce((p_patch->>'double_win_score')::int, cur.double_win_score),
    coalesce((p_patch->>'split_win_score')::int, cur.split_win_score),
    coalesce((p_patch->>'max_score_per_round')::int, cur.max_score_per_round),
    now(), p_admin, p_admin, p_reason)
  RETURNING id INTO nid;

  UPDATE public.arcade_bj_score_configs SET status='retired', effective_to=now() WHERE id = cur.id;
  PERFORM public.create_audit_log('arcade_bj_score_configs', nid::text, 'publish', p_patch, p_admin);
  RETURN nid;
END $$;

CREATE OR REPLACE FUNCTION public.arcade_bj_reveal_shoe(p_user uuid, p_hand uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE h public.arcade_bj_hands; s public.arcade_bj_shoes; open_hands int;
BEGIN
  SELECT * INTO h FROM public.arcade_bj_hands WHERE id=p_hand AND user_id=p_user;
  IF NOT FOUND THEN RAISE EXCEPTION 'HAND_NOT_FOUND'; END IF;
  IF h.status NOT IN ('COMPLETED','VOID','REVERSED','EXPIRED') THEN RAISE EXCEPTION 'HAND_NOT_SETTLED'; END IF;
  SELECT * INTO s FROM public.arcade_bj_shoes WHERE id = h.shoe_id;

  SELECT count(*) INTO open_hands FROM public.arcade_bj_hands
    WHERE shoe_id = s.id AND status IN ('CREATED','DEALING','PLAYER_TURN','DEALER_CHECK','DEALER_TURN','SETTLING');
  IF open_hands > 0 OR s.status IN ('ACTIVE','NEAR_CUT') THEN
    UPDATE public.arcade_bj_shoes SET status='AWAITING_REVEAL', retired_at=now() WHERE id=s.id AND status IN ('ACTIVE','NEAR_CUT');
    SELECT * INTO s FROM public.arcade_bj_shoes WHERE id = h.shoe_id;
  END IF;

  UPDATE public.arcade_bj_shoes SET status='VERIFIED', revealed_at=coalesce(revealed_at, now()) WHERE id=s.id;

  RETURN jsonb_build_object(
    'serverSeed', s.server_seed,
    'serverSeedHash', s.server_seed_hash,
    'clientSeed', s.client_seed,
    'nonce', s.nonce,
    'deckCount', s.deck_count,
    'totalCards', s.total_cards,
    'cardOrder', to_jsonb(s.card_order),
    'cards', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'owner', c.owner_type, 'rank', c.rank, 'suit', c.suit,
        'position', c.shoe_position, 'sequence', c.deal_sequence) ORDER BY c.deal_sequence), '[]'::jsonb)
      FROM public.arcade_bj_cards c WHERE c.hand_id = p_hand)
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.arcade_bj_shuffle(text,text,integer,integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_draw(uuid,uuid,text,boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_settle(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_ensure_entries(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_start_hand(uuid,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_hit(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_stand(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_double(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_split(uuid,uuid,uuid,int,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_expire_hands() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_admin_resolve_hand(uuid,uuid,text,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_publish_rule_config(uuid,jsonb,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_publish_score_config(uuid,jsonb,text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.arcade_bj_reveal_shoe(uuid,uuid) FROM anon, authenticated;
