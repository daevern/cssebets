
-- ============================================================
-- CSSE Token Engagement System
-- ============================================================

-- Shared updated_at helper (idempotent)
CREATE OR REPLACE FUNCTION public.csse_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============================================================
-- 1. csse_token_wallets
-- ============================================================
CREATE TABLE public.csse_token_wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent BIGINT NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.csse_token_wallets TO authenticated;
GRANT ALL ON public.csse_token_wallets TO service_role;

ALTER TABLE public.csse_token_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own token wallet" ON public.csse_token_wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_csse_token_wallets_updated_at
  BEFORE UPDATE ON public.csse_token_wallets
  FOR EACH ROW EXECUTE FUNCTION public.csse_touch_updated_at();

-- ============================================================
-- 2. csse_token_transactions
-- ============================================================
CREATE TABLE public.csse_token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta BIGINT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earn','spend','adjust')),
  source TEXT NOT NULL,
  source_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX csse_token_tx_user_created_idx
  ON public.csse_token_transactions (user_id, created_at DESC);

GRANT SELECT ON public.csse_token_transactions TO authenticated;
GRANT ALL ON public.csse_token_transactions TO service_role;

ALTER TABLE public.csse_token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own token tx" ON public.csse_token_transactions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- Append-only guard
CREATE OR REPLACE FUNCTION public.csse_token_tx_readonly_guard()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'csse_token_transactions is append-only';
END $$;

CREATE TRIGGER trg_csse_token_tx_no_update
  BEFORE UPDATE OR DELETE ON public.csse_token_transactions
  FOR EACH ROW EXECUTE FUNCTION public.csse_token_tx_readonly_guard();

-- ============================================================
-- 3. csse_store_items
-- ============================================================
CREATE TABLE public.csse_store_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key TEXT UNIQUE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('free_bet')),
  label TEXT NOT NULL,
  stake_amount NUMERIC(14,2) NOT NULL CHECK (stake_amount > 0),
  token_price INT NOT NULL CHECK (token_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.csse_store_items TO authenticated;
GRANT ALL ON public.csse_store_items TO service_role;

ALTER TABLE public.csse_store_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read active store items" ON public.csse_store_items
  FOR SELECT TO authenticated
  USING (is_active = true
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "admins insert store items" ON public.csse_store_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin'::app_role)
           OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "admins update store items" ON public.csse_store_items
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "admins delete store items" ON public.csse_store_items
  FOR DELETE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_csse_store_items_updated_at
  BEFORE UPDATE ON public.csse_store_items
  FOR EACH ROW EXECUTE FUNCTION public.csse_touch_updated_at();

INSERT INTO public.csse_store_items (item_key, kind, label, stake_amount, token_price, is_active, sort_order) VALUES
  ('fb-10',  'free_bet', 'Free Bet · 10 pts',   10,  100, true, 10),
  ('fb-25',  'free_bet', 'Free Bet · 25 pts',   25,  250, true, 20),
  ('fb-50',  'free_bet', 'Free Bet · 50 pts',   50,  500, true, 30),
  ('fb-100', 'free_bet', 'Free Bet · 100 pts', 100, 1000, true, 40);

-- ============================================================
-- 4. csse_free_bets (predictions FK added later)
-- ============================================================
CREATE TABLE public.csse_free_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake_amount NUMERIC(14,2) NOT NULL CHECK (stake_amount > 0),
  token_cost INT NOT NULL CHECK (token_cost >= 0),
  status TEXT NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','consumed','expired','refunded')),
  prediction_id UUID,
  source TEXT NOT NULL DEFAULT 'store_purchase',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  settled_outcome TEXT
);

CREATE INDEX csse_free_bets_user_status_idx
  ON public.csse_free_bets (user_id, status);

GRANT SELECT ON public.csse_free_bets TO authenticated;
GRANT ALL ON public.csse_free_bets TO service_role;

ALTER TABLE public.csse_free_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own free bets" ON public.csse_free_bets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

-- Alter predictions
ALTER TABLE public.predictions
  ADD COLUMN free_bet_id UUID REFERENCES public.csse_free_bets(id) ON DELETE SET NULL;

CREATE INDEX predictions_free_bet_idx
  ON public.predictions (free_bet_id) WHERE free_bet_id IS NOT NULL;

ALTER TABLE public.csse_free_bets
  ADD CONSTRAINT csse_free_bets_prediction_fk
  FOREIGN KEY (prediction_id) REFERENCES public.predictions(id) ON DELETE SET NULL;

-- ============================================================
-- 5. Referral fields on profiles
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_alphabet TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_len INT := 7;
  v_code TEXT;
  v_i INT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..v_len LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = v_code) INTO v_exists;
    IF NOT v_exists THEN RETURN v_code; END IF;
  END LOOP;
END $$;

ALTER TABLE public.profiles
  ADD COLUMN referral_code TEXT,
  ADD COLUMN referred_by_code TEXT;

-- Backfill for existing profiles
UPDATE public.profiles SET referral_code = public.generate_referral_code() WHERE referral_code IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN referral_code SET NOT NULL,
  ADD CONSTRAINT profiles_referral_code_unique UNIQUE (referral_code);

CREATE OR REPLACE FUNCTION public.profiles_assign_referral_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  IF NEW.referred_by_code IS NOT NULL THEN
    NEW.referred_by_code := upper(NEW.referred_by_code);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_profiles_assign_referral_code
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_assign_referral_code();

CREATE OR REPLACE FUNCTION public.prevent_referral_field_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code is immutable';
  END IF;
  IF OLD.referred_by_code IS NOT NULL
     AND NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code THEN
    RAISE EXCEPTION 'referred_by_code is immutable once set';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_prevent_referral_field_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_referral_field_change();

-- ============================================================
-- 6. referrals
-- ============================================================
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  cumulative_settled_wagered NUMERIC(14,2) NOT NULL DEFAULT 0,
  stage1_completed BOOLEAN NOT NULL DEFAULT false,
  stage2_completed BOOLEAN NOT NULL DEFAULT false,
  stage3_completed BOOLEAN NOT NULL DEFAULT false,
  stage1_rewarded_at TIMESTAMPTZ,
  stage2_rewarded_at TIMESTAMPTZ,
  stage3_rewarded_at TIMESTAMPTZ,
  total_tokens_awarded NUMERIC(14,2) NOT NULL DEFAULT 0,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX referrals_referrer_idx ON public.referrals (referrer_user_id);

GRANT SELECT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own referral rows" ON public.referrals
  FOR SELECT TO authenticated
  USING (referrer_user_id = auth.uid()
      OR referred_user_id = auth.uid()
      OR private.has_role(auth.uid(), 'admin'::app_role)
      OR private.has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER trg_referrals_updated_at
  BEFORE UPDATE ON public.referrals
  FOR EACH ROW EXECUTE FUNCTION public.csse_touch_updated_at();

-- ============================================================
-- 7. Update handle_new_user()
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_meta_phone TEXT;
  v_ref_code   TEXT;
  v_referrer   UUID;
BEGIN
  v_meta_phone := NULLIF(NEW.raw_user_meta_data->>'phone_number', '');
  v_ref_code   := upper(NULLIF(NEW.raw_user_meta_data->>'referral_code', ''));

  INSERT INTO public.profiles (id, display_name, phone_number, auth_provider, public_reference, referred_by_code)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      v_meta_phone,
      split_part(COALESCE(NEW.email, ''), '@', 1),
      NULLIF(NEW.phone, '')
    ),
    COALESCE(NULLIF(NEW.phone, ''), v_meta_phone),
    CASE
      WHEN (NEW.phone IS NOT NULL AND NEW.phone <> '') OR v_meta_phone IS NOT NULL THEN 'phone'
      ELSE 'email'
    END,
    public.generate_public_reference(),
    v_ref_code
  )
  ON CONFLICT (id) DO UPDATE
    SET phone_number = COALESCE(EXCLUDED.phone_number, public.profiles.phone_number),
        auth_provider = COALESCE(public.profiles.auth_provider, EXCLUDED.auth_provider);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending')
    ON CONFLICT DO NOTHING;

  -- Referral attribution
  IF v_ref_code IS NOT NULL THEN
    SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = v_ref_code LIMIT 1;
    IF v_referrer IS NOT NULL AND v_referrer = NEW.id THEN
      INSERT INTO public.audit_log (user_id, action, entity, metadata)
      VALUES (NEW.id, 'referral_self_blocked', 'referrals',
              jsonb_build_object('code', v_ref_code));
    ELSIF v_referrer IS NOT NULL THEN
      INSERT INTO public.referrals (referrer_user_id, referred_user_id, referral_code)
      VALUES (v_referrer, NEW.id, v_ref_code)
      ON CONFLICT (referred_user_id) DO NOTHING;
      INSERT INTO public.audit_log (user_id, action, entity, metadata)
      VALUES (NEW.id, 'referral_attributed', 'referrals',
              jsonb_build_object('code', v_ref_code, 'referrer_user_id', v_referrer));
    END IF;
  END IF;

  RETURN NEW;
END $$;

-- ============================================================
-- Internal helper: credit tokens (writes wallet + ledger row atomically)
-- ============================================================
CREATE OR REPLACE FUNCTION public.csse_credit_tokens(
  p_user_id UUID,
  p_delta BIGINT,
  p_kind TEXT,
  p_source TEXT,
  p_source_ref TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  IF p_delta = 0 THEN
    SELECT balance INTO v_balance FROM public.csse_token_wallets WHERE user_id = p_user_id;
    RETURN COALESCE(v_balance, 0);
  END IF;

  INSERT INTO public.csse_token_wallets (user_id, balance, lifetime_earned, lifetime_spent)
  VALUES (p_user_id, 0, 0, 0) ON CONFLICT (user_id) DO NOTHING;

  IF p_delta > 0 THEN
    UPDATE public.csse_token_wallets
    SET balance = balance + p_delta,
        lifetime_earned = lifetime_earned + (CASE WHEN p_kind = 'earn' THEN p_delta ELSE 0 END),
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;
  ELSE
    -- clamp to 0
    UPDATE public.csse_token_wallets
    SET balance = GREATEST(0, balance + p_delta),
        lifetime_earned = CASE
          WHEN p_source = 'void_refund' THEN GREATEST(0, lifetime_earned + p_delta)
          ELSE lifetime_earned
        END,
        lifetime_spent = CASE
          WHEN p_kind = 'spend' THEN lifetime_spent + ABS(p_delta)
          ELSE lifetime_spent
        END,
        updated_at = now()
    WHERE user_id = p_user_id
    RETURNING balance INTO v_balance;
  END IF;

  INSERT INTO public.csse_token_transactions
    (user_id, delta, kind, source, source_ref, metadata, balance_after)
  VALUES (p_user_id, p_delta, p_kind, p_source, p_source_ref, COALESCE(p_metadata,'{}'::jsonb), v_balance);

  RETURN v_balance;
END $$;

-- ============================================================
-- 8. award_referral_milestones
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_referral_milestones(p_referred_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_ref RECORD;
  v_total NUMERIC;
BEGIN
  SELECT * INTO v_ref FROM public.referrals
    WHERE referred_user_id = p_referred_user_id
    FOR UPDATE;
  IF NOT FOUND OR v_ref.flagged THEN RETURN; END IF;

  SELECT COALESCE(SUM(virtual_stake), 0) INTO v_total
    FROM public.predictions
    WHERE user_id = p_referred_user_id
      AND status IN ('won','lost')
      AND is_simulation = false
      AND free_bet_id IS NULL;

  UPDATE public.referrals SET cumulative_settled_wagered = v_total, updated_at = now()
    WHERE id = v_ref.id;

  -- Stage 1
  IF NOT v_ref.stage1_completed AND v_total >= 50 THEN
    PERFORM public.csse_credit_tokens(
      v_ref.referrer_user_id, 50, 'earn', 'referral_reward', v_ref.id::text,
      jsonb_build_object('stage',1,'threshold',50,'tokens',50,'referred_user_id',p_referred_user_id)
    );
    UPDATE public.referrals
      SET stage1_completed = true, stage1_rewarded_at = now(),
          total_tokens_awarded = total_tokens_awarded + 50, updated_at = now()
      WHERE id = v_ref.id;
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
    VALUES (v_ref.referrer_user_id,'referral_stage1_awarded','referrals',v_ref.id,
            jsonb_build_object('referred_user_id',p_referred_user_id,'tokens',50));
  END IF;

  -- Stage 2
  IF NOT v_ref.stage2_completed AND v_total >= 500 THEN
    PERFORM public.csse_credit_tokens(
      v_ref.referrer_user_id, 50, 'earn', 'referral_reward', v_ref.id::text,
      jsonb_build_object('stage',2,'threshold',500,'tokens',50,'referred_user_id',p_referred_user_id)
    );
    UPDATE public.referrals
      SET stage2_completed = true, stage2_rewarded_at = now(),
          total_tokens_awarded = total_tokens_awarded + 50, updated_at = now()
      WHERE id = v_ref.id;
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
    VALUES (v_ref.referrer_user_id,'referral_stage2_awarded','referrals',v_ref.id,
            jsonb_build_object('referred_user_id',p_referred_user_id,'tokens',50));
  END IF;

  -- Stage 3
  IF NOT v_ref.stage3_completed AND v_total >= 1000 THEN
    PERFORM public.csse_credit_tokens(
      v_ref.referrer_user_id, 100, 'earn', 'referral_reward', v_ref.id::text,
      jsonb_build_object('stage',3,'threshold',1000,'tokens',100,'referred_user_id',p_referred_user_id)
    );
    UPDATE public.referrals
      SET stage3_completed = true, stage3_rewarded_at = now(),
          total_tokens_awarded = total_tokens_awarded + 100, updated_at = now()
      WHERE id = v_ref.id;
    INSERT INTO public.audit_log (user_id, action, entity, entity_id, metadata)
    VALUES (v_ref.referrer_user_id,'referral_stage3_awarded','referrals',v_ref.id,
            jsonb_build_object('referred_user_id',p_referred_user_id,'tokens',100));
  END IF;
END $$;

-- ============================================================
-- 9. tg_referral_check_on_settle
-- ============================================================
CREATE OR REPLACE FUNCTION public.tg_referral_check_on_settle()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('won','lost') THEN RETURN NEW; END IF;
  IF NEW.is_simulation THEN RETURN NEW; END IF;
  IF NEW.free_bet_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  PERFORM public.award_referral_milestones(NEW.user_id);
  RETURN NEW;
END $$;

CREATE TRIGGER tg_referral_check_on_settle
  AFTER UPDATE OF status ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.tg_referral_check_on_settle();

-- ============================================================
-- 10. csse_grant_tokens_on_bet
-- ============================================================
CREATE OR REPLACE FUNCTION public.csse_grant_tokens_on_bet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_tokens BIGINT;
BEGIN
  IF NEW.is_simulation THEN RETURN NEW; END IF;
  IF NEW.free_bet_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.virtual_stake < 10 THEN RETURN NEW; END IF;

  v_tokens := floor(NEW.virtual_stake / 10)::bigint;
  IF v_tokens <= 0 THEN RETURN NEW; END IF;

  PERFORM public.csse_credit_tokens(
    NEW.user_id, v_tokens, 'earn', 'bet_placement', NEW.id::text,
    jsonb_build_object('stake', NEW.virtual_stake, 'rate', '1 per 10')
  );
  RETURN NEW;
END $$;

CREATE TRIGGER trg_csse_grant_tokens_on_bet
  AFTER INSERT ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.csse_grant_tokens_on_bet();

-- ============================================================
-- 11. csse_clawback_tokens_on_void
-- ============================================================
CREATE OR REPLACE FUNCTION public.csse_clawback_tokens_on_void()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_granted BIGINT;
BEGIN
  IF NEW.status = OLD.status OR NEW.status <> 'void' THEN RETURN NEW; END IF;
  IF NEW.is_simulation THEN RETURN NEW; END IF;
  IF NEW.free_bet_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(delta),0) INTO v_granted
    FROM public.csse_token_transactions
    WHERE source = 'bet_placement' AND source_ref = NEW.id::text;

  IF v_granted > 0 THEN
    PERFORM public.csse_credit_tokens(
      NEW.user_id, -v_granted, 'adjust', 'void_refund', NEW.id::text,
      jsonb_build_object('clawback', v_granted)
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_csse_clawback_tokens_on_void
  AFTER UPDATE OF status ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.csse_clawback_tokens_on_void();

-- ============================================================
-- 12. redeem_free_bet
-- ============================================================
CREATE OR REPLACE FUNCTION public.redeem_free_bet(
  p_user_id UUID,
  p_stake_amount NUMERIC,
  p_token_cost INT,
  p_store_item TEXT
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_wallet RECORD;
  v_new_balance BIGINT;
  v_fb_id UUID;
BEGIN
  INSERT INTO public.csse_token_wallets (user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_wallet FROM public.csse_token_wallets
    WHERE user_id = p_user_id FOR UPDATE;

  IF v_wallet.balance < p_token_cost THEN
    RAISE EXCEPTION 'INSUFFICIENT_TOKENS';
  END IF;

  v_new_balance := v_wallet.balance - p_token_cost;
  UPDATE public.csse_token_wallets
    SET balance = v_new_balance,
        lifetime_spent = lifetime_spent + p_token_cost,
        updated_at = now()
    WHERE user_id = p_user_id;

  INSERT INTO public.csse_token_transactions
    (user_id, delta, kind, source, source_ref, metadata, balance_after)
  VALUES (p_user_id, -p_token_cost, 'spend', 'store_purchase', p_store_item,
          jsonb_build_object('stake_amount', p_stake_amount, 'item_key', p_store_item),
          v_new_balance);

  INSERT INTO public.csse_free_bets (user_id, stake_amount, token_cost, status, source, metadata)
  VALUES (p_user_id, p_stake_amount, p_token_cost, 'available', 'store_purchase',
          jsonb_build_object('item_key', p_store_item))
  RETURNING id INTO v_fb_id;

  RETURN v_fb_id;
END $$;

REVOKE ALL ON FUNCTION public.redeem_free_bet(UUID, NUMERIC, INT, TEXT) FROM PUBLIC;

-- ============================================================
-- 13. place_free_bet_atomic
-- ============================================================
CREATE OR REPLACE FUNCTION public.place_free_bet_atomic(
  p_user_id UUID,
  p_free_bet_id UUID,
  p_match_id UUID,
  p_market prediction_market,
  p_outcome TEXT,
  p_odds NUMERIC,
  p_snapshot_id UUID,
  p_client_request_id UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_fb RECORD;
  v_match RECORD;
  v_potential NUMERIC;
  v_max_payout NUMERIC;
  v_pred_id UUID;
BEGIN
  SELECT * INTO v_fb FROM public.csse_free_bets
    WHERE id = p_free_bet_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FREE_BET_NOT_FOUND'; END IF;
  IF v_fb.status <> 'available' THEN RAISE EXCEPTION 'FREE_BET_UNAVAILABLE'; END IF;

  -- Duplicate request guard
  IF p_client_request_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.predictions
      WHERE user_id = p_user_id AND client_request_id = p_client_request_id
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_REQUEST';
  END IF;

  IF p_match_id IS NOT NULL THEN
    SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR SHARE;
    IF FOUND AND (v_match.status IN ('live','finished','postponed','cancelled')
                  OR v_match.kickoff_at <= now()) THEN
      RAISE EXCEPTION 'MATCH_LOCKED';
    END IF;
  END IF;

  v_potential := ROUND(v_fb.stake_amount * p_odds, 2);

  SELECT NULLIF(max_potential_payout, 0) INTO v_max_payout
    FROM public.platform_settings WHERE id = 1;
  IF v_max_payout IS NOT NULL AND v_potential > v_max_payout THEN
    RAISE EXCEPTION 'MAX_PAYOUT_EXCEEDED';
  END IF;

  INSERT INTO public.predictions
    (user_id, match_id, market, outcome, reference_odds, virtual_stake,
     potential_return, reference_odds_snapshot_id, client_request_id,
     free_bet_id, status)
  VALUES
    (p_user_id, p_match_id, p_market, p_outcome, p_odds, v_fb.stake_amount,
     v_potential, p_snapshot_id, p_client_request_id, v_fb.id, 'pending')
  RETURNING id INTO v_pred_id;

  UPDATE public.csse_free_bets
    SET status = 'consumed',
        consumed_at = now(),
        prediction_id = v_pred_id
    WHERE id = v_fb.id;

  -- Simulation-house accounting: record the free-bet stake issued (best-effort)
  BEGIN
    PERFORM public.platform_apply_change(
      'stake_collected'::platform_txn_type,
      -v_fb.stake_amount,
      v_pred_id, p_match_id,
      'free_bet_stake_issued', false
    );
  EXCEPTION WHEN OTHERS THEN
    -- Non-fatal: free-bet lifecycle still tracked in csse_free_bets.
    NULL;
  END;

  RETURN v_pred_id;
END $$;

-- ============================================================
-- 14. csse_free_bet_settle_adjust
-- ============================================================
CREATE OR REPLACE FUNCTION public.csse_free_bet_settle_adjust()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_stake NUMERIC;
BEGIN
  IF NEW.free_bet_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('won','lost','void') THEN RETURN NEW; END IF;
  -- Only settle once
  IF EXISTS (SELECT 1 FROM public.csse_free_bets WHERE id = NEW.free_bet_id AND settled_at IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_stake := NEW.virtual_stake;

  IF NEW.status = 'won' THEN
    -- Normal settlement credited stake + profit; remove the stake portion.
    UPDATE public.wallets
      SET balance = GREATEST(0, balance - v_stake), updated_at = now()
      WHERE user_id = NEW.user_id;
    -- Return stake to house accounting (best-effort)
    BEGIN
      PERFORM public.platform_apply_change(
        'stake_collected'::platform_txn_type,
        v_stake, NEW.id, NEW.match_id,
        'free_bet_stake_returned_win', false
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.status = 'void' THEN
    BEGIN
      PERFORM public.platform_apply_change(
        'stake_collected'::platform_txn_type,
        v_stake, NEW.id, NEW.match_id,
        'free_bet_stake_returned_void', false
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  UPDATE public.csse_free_bets
    SET settled_at = now(),
        settled_outcome = NEW.status::text,
        status = CASE WHEN NEW.status = 'void' THEN 'refunded' ELSE csse_free_bets.status END
    WHERE id = NEW.free_bet_id;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_csse_free_bet_settle_adjust
  AFTER UPDATE OF status ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.csse_free_bet_settle_adjust();

-- ============================================================
-- 15. Admin RPCs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_adjust_referral(
  p_referral_id UUID,
  p_tokens_delta INT,
  p_reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_ref RECORD;
  v_kind TEXT;
  v_source TEXT;
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT * INTO v_ref FROM public.referrals WHERE id = p_referral_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REFERRAL_NOT_FOUND'; END IF;

  v_kind := CASE WHEN p_tokens_delta > 0 THEN 'earn' ELSE 'adjust' END;
  v_source := CASE WHEN p_tokens_delta > 0 THEN 'referral_reward' ELSE 'admin_adjust' END;

  PERFORM public.csse_credit_tokens(
    v_ref.referrer_user_id, p_tokens_delta, v_kind, v_source, v_ref.id::text,
    jsonb_build_object('reason', p_reason, 'admin_id', auth.uid())
  );

  UPDATE public.referrals
    SET total_tokens_awarded = GREATEST(0, total_tokens_awarded + p_tokens_delta),
        updated_at = now()
    WHERE id = v_ref.id;

  INSERT INTO public.audit_log (user_id, action, entity, entity_id, reason, metadata)
  VALUES (auth.uid(), 'referral_reward_adjusted_admin', 'referrals', v_ref.id, p_reason,
          jsonb_build_object('tokens_delta', p_tokens_delta, 'referrer_user_id', v_ref.referrer_user_id));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_adjust_referral(UUID, INT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_flag_referral(
  p_referral_id UUID,
  p_flagged BOOLEAN,
  p_reason TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  UPDATE public.referrals
    SET flagged = p_flagged, flag_reason = p_reason, updated_at = now()
    WHERE id = p_referral_id;

  INSERT INTO public.audit_log (user_id, action, entity, entity_id, reason, metadata)
  VALUES (auth.uid(), CASE WHEN p_flagged THEN 'referral_flagged' ELSE 'referral_unflagged' END,
          'referrals', p_referral_id, p_reason,
          jsonb_build_object('flagged', p_flagged));
END $$;

GRANT EXECUTE ON FUNCTION public.admin_flag_referral(UUID, BOOLEAN, TEXT) TO authenticated;

-- Admin token grant helper (used by server function)
CREATE OR REPLACE FUNCTION public.admin_grant_tokens(
  p_user_id UUID,
  p_amount BIGINT,
  p_reason TEXT
) RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $$
DECLARE
  v_bal BIGINT;
  v_kind TEXT;
  v_source TEXT;
BEGIN
  IF NOT (private.has_role(auth.uid(),'admin'::app_role)
       OR private.has_role(auth.uid(),'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  v_kind := CASE WHEN p_amount >= 0 THEN 'earn' ELSE 'adjust' END;
  v_source := CASE WHEN p_amount >= 0 THEN 'admin_grant' ELSE 'admin_adjust' END;

  v_bal := public.csse_credit_tokens(
    p_user_id, p_amount, v_kind, v_source, NULL,
    jsonb_build_object('reason', p_reason, 'admin_id', auth.uid())
  );

  INSERT INTO public.audit_log (user_id, action, entity, target_user_id, reason, metadata)
  VALUES (auth.uid(), 'admin_grant_tokens', 'csse_token_wallets', p_user_id, p_reason,
          jsonb_build_object('amount', p_amount));
  RETURN v_bal;
END $$;

GRANT EXECUTE ON FUNCTION public.admin_grant_tokens(UUID, BIGINT, TEXT) TO authenticated;
