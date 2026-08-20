-- ============ types ============
DO $$ BEGIN
  CREATE TYPE public.bonus_group AS ENUM ('EXISTING_USER','NEW_USER');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bonus_enrolment_status AS ENUM ('ELIGIBLE','SLOT_RESERVED','AWARDED','FORFEITED','EXPIRED','INELIGIBLE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ wallets: locked bonus split ============
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS locked_bonus_balance numeric NOT NULL DEFAULT 0;

ALTER TABLE public.wallets
  DROP CONSTRAINT IF EXISTS wallets_locked_bonus_nonneg;
ALTER TABLE public.wallets
  ADD CONSTRAINT wallets_locked_bonus_nonneg CHECK (locked_bonus_balance >= 0);

-- ============ campaign tables ============
CREATE TABLE IF NOT EXISTS public.bonus_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  bonus_amount numeric NOT NULL DEFAULT 100,
  new_user_cap integer NOT NULL DEFAULT 100,
  reassign_forfeited_slots boolean NOT NULL DEFAULT true,
  include_admin_accounts boolean NOT NULL DEFAULT false,
  include_simulation_accounts boolean NOT NULL DEFAULT false,
  include_internal_accounts boolean NOT NULL DEFAULT false,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.bonus_campaigns TO authenticated, anon;
GRANT ALL ON public.bonus_campaigns TO service_role;
ALTER TABLE public.bonus_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign readable" ON public.bonus_campaigns;
CREATE POLICY "campaign readable" ON public.bonus_campaigns FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS public.bonus_campaign_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.bonus_campaigns(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  eligibility_group public.bonus_group NOT NULL,
  slot_number integer,
  account_created_at timestamptz,
  slot_reserved_at timestamptz,
  awarded_at timestamptz,
  forfeited_at timestamptz,
  forfeit_reason text,
  bonus_amount numeric NOT NULL DEFAULT 0,
  remaining_locked_bonus numeric NOT NULL DEFAULT 0,
  status public.bonus_enrolment_status NOT NULL DEFAULT 'ELIGIBLE',
  journal_transaction_id uuid,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bonus_enrolment_slot_range CHECK (slot_number IS NULL OR slot_number BETWEEN 1 AND 100),
  CONSTRAINT bonus_enrolment_amount_cap CHECK (bonus_amount >= 0 AND bonus_amount <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_enrolment_campaign_user_uidx
  ON public.bonus_campaign_enrolments (campaign_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_enrolment_idem_uidx
  ON public.bonus_campaign_enrolments (idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS bonus_enrolment_live_slot_uidx
  ON public.bonus_campaign_enrolments (campaign_id, slot_number)
  WHERE slot_number IS NOT NULL AND status <> 'FORFEITED';
GRANT SELECT ON public.bonus_campaign_enrolments TO authenticated;
GRANT ALL ON public.bonus_campaign_enrolments TO service_role;
ALTER TABLE public.bonus_campaign_enrolments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own enrolment readable" ON public.bonus_campaign_enrolments;
CREATE POLICY "own enrolment readable" ON public.bonus_campaign_enrolments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.bonus_slot_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid,
  user_id uuid,
  slot_number integer,
  event text NOT NULL,
  reason text,
  actor uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bonus_slot_audit TO service_role;
ALTER TABLE public.bonus_slot_audit ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.bonus_wager_funding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  reference_type text,
  reference_id uuid,
  stake numeric NOT NULL,
  bonus_funded numeric NOT NULL DEFAULT 0,
  withdrawable_funded numeric NOT NULL DEFAULT 0,
  remaining numeric NOT NULL DEFAULT 0,
  returned_bonus numeric NOT NULL DEFAULT 0,
  returned_withdrawable numeric NOT NULL DEFAULT 0,
  profit numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
CREATE INDEX IF NOT EXISTS bonus_wager_funding_open_idx
  ON public.bonus_wager_funding (user_id, created_at) WHERE status = 'OPEN';
GRANT SELECT ON public.bonus_wager_funding TO authenticated;
GRANT ALL ON public.bonus_wager_funding TO service_role;
ALTER TABLE public.bonus_wager_funding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own funding readable" ON public.bonus_wager_funding;
CREATE POLICY "own funding readable" ON public.bonus_wager_funding
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ============ wallet split engine ============
CREATE OR REPLACE FUNCTION public.wallet_ctx()
RETURNS text LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT COALESCE(NULLIF(current_setting('app.wallet_ctx', true), ''), 'wager')
$$;

CREATE OR REPLACE FUNCTION public.wallets_bonus_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_delta   numeric;
  v_locked  numeric := COALESCE(OLD.locked_bonus_balance, 0);
  v_ctx     text := public.wallet_ctx();
  v_debit   numeric;
  v_credit  numeric;
  v_bonus   numeric;
  v_row     public.bonus_wager_funding%ROWTYPE;
  v_principal numeric;
  v_ret_bonus numeric;
BEGIN
  v_delta := ROUND(COALESCE(NEW.balance,0) - COALESCE(OLD.balance,0), 2);

  IF v_ctx = 'bonus_grant' AND v_delta > 0 THEN
    NEW.locked_bonus_balance := ROUND(v_locked + v_delta, 2);
  ELSIF v_delta = 0 THEN
    NEW.locked_bonus_balance := v_locked;
  ELSIF v_ctx IN ('withdrawable','payout','deposit','admin') THEN
    -- these movements never touch locked bonus money
    IF v_delta < 0 AND ROUND(COALESCE(OLD.balance,0) - v_locked, 2) < -v_delta THEN
      RAISE EXCEPTION 'BONUS_LOCKED_FUNDS';
    END IF;
    NEW.locked_bonus_balance := v_locked;
  ELSIF v_delta < 0 THEN
    -- wager stake: bonus money is consumed first, composition is recorded
    v_debit := -v_delta;
    v_bonus := LEAST(v_locked, v_debit);
    NEW.locked_bonus_balance := ROUND(v_locked - v_bonus, 2);
    INSERT INTO public.bonus_wager_funding(
      user_id, reference_type, reference_id, stake, bonus_funded, withdrawable_funded, remaining, status)
    VALUES (
      NEW.user_id,
      NULLIF(current_setting('app.wallet_ref_type', true), ''),
      NULLIF(current_setting('app.wallet_ref_id', true), '')::uuid,
      v_debit, v_bonus, ROUND(v_debit - v_bonus, 2), v_debit,
      CASE WHEN v_bonus > 0 THEN 'OPEN' ELSE 'OPEN' END);
  ELSE
    -- settlement credit: return principal to its original bucket, profit is withdrawable
    v_credit := v_delta;
    SELECT * INTO v_row FROM public.bonus_wager_funding
      WHERE user_id = NEW.user_id AND status = 'OPEN'
      ORDER BY created_at ASC, id ASC LIMIT 1 FOR UPDATE;
    IF FOUND AND v_row.stake > 0 THEN
      v_principal := LEAST(v_credit, v_row.remaining);
      v_ret_bonus := ROUND(v_principal * (v_row.bonus_funded / v_row.stake), 2);
      NEW.locked_bonus_balance := ROUND(v_locked + v_ret_bonus, 2);
      UPDATE public.bonus_wager_funding
        SET remaining = ROUND(v_row.remaining - v_principal, 2),
            returned_bonus = ROUND(returned_bonus + v_ret_bonus, 2),
            returned_withdrawable = ROUND(returned_withdrawable + (v_principal - v_ret_bonus), 2),
            profit = ROUND(profit + GREATEST(v_credit - v_principal, 0), 2),
            status = CASE WHEN ROUND(v_row.remaining - v_principal, 2) <= 0 THEN 'CLOSED' ELSE 'OPEN' END,
            closed_at = CASE WHEN ROUND(v_row.remaining - v_principal, 2) <= 0 THEN now() ELSE NULL END
        WHERE id = v_row.id;
    ELSE
      NEW.locked_bonus_balance := v_locked;
    END IF;
  END IF;

  IF NEW.locked_bonus_balance < 0 THEN NEW.locked_bonus_balance := 0; END IF;
  IF NEW.locked_bonus_balance > COALESCE(NEW.balance,0) THEN
    NEW.locked_bonus_balance := ROUND(COALESCE(NEW.balance,0), 2);
  END IF;

  UPDATE public.bonus_campaign_enrolments
     SET remaining_locked_bonus = NEW.locked_bonus_balance, updated_at = now()
   WHERE user_id = NEW.user_id AND status = 'AWARDED';

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS wallets_bonus_split_trg ON public.wallets;
CREATE TRIGGER wallets_bonus_split_trg
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.wallets_bonus_split();

-- ============ eligibility ============
CREATE OR REPLACE FUNCTION public.bonus_active_campaign()
RETURNS public.bonus_campaigns LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.bonus_campaigns
   WHERE enabled AND (ends_at IS NULL OR ends_at > now())
   ORDER BY starts_at DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.bonus_user_is_valid(p_user uuid, p_campaign public.bonus_campaigns)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prof public.profiles%ROWTYPE;
  v_email text;
  v_deleted timestamptz;
BEGIN
  SELECT * INTO v_prof FROM public.profiles WHERE id = p_user;
  IF NOT FOUND THEN RETURN false; END IF;
  IF COALESCE(v_prof.suspended, false) THEN RETURN false; END IF;
  IF v_prof.auth_provider = 'anonymous' THEN RETURN false; END IF;
  IF COALESCE(v_prof.is_simulation, false) AND NOT p_campaign.include_simulation_accounts THEN RETURN false; END IF;

  SELECT email, deleted_at INTO v_email, v_deleted FROM auth.users WHERE id = p_user;
  IF v_deleted IS NOT NULL THEN RETURN false; END IF;
  IF NOT p_campaign.include_internal_accounts AND COALESCE(v_email,'') ILIKE '%.local' THEN RETURN false; END IF;

  IF NOT p_campaign.include_admin_accounts AND EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_user AND role IN ('admin','super_admin','customer_support','viewer')
  ) THEN RETURN false; END IF;

  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.bonus_user_is_approved(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = 'member')
$$;

-- ============ concurrency-safe slot reservation ============
CREATE OR REPLACE FUNCTION public.bonus_reserve_new_user_slot(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c public.bonus_campaigns;
  v_created timestamptz;
  v_slot integer;
  v_existing public.bonus_campaign_enrolments;
BEGIN
  SELECT * INTO v_c FROM public.bonus_active_campaign();
  IF v_c.id IS NULL THEN RETURN NULL; END IF;

  SELECT created_at INTO v_created FROM auth.users WHERE id = p_user;
  IF v_created IS NULL OR v_created < v_c.starts_at THEN RETURN NULL; END IF;
  IF NOT public.bonus_user_is_valid(p_user, v_c) THEN RETURN NULL; END IF;

  SELECT * INTO v_existing FROM public.bonus_campaign_enrolments
    WHERE campaign_id = v_c.id AND user_id = p_user;
  IF FOUND THEN RETURN v_existing.slot_number; END IF;

  -- serialise all slot allocation on the campaign row
  PERFORM 1 FROM public.bonus_campaigns WHERE id = v_c.id FOR UPDATE;

  SELECT s.n INTO v_slot
    FROM generate_series(1, v_c.new_user_cap) AS s(n)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.bonus_campaign_enrolments e
      WHERE e.campaign_id = v_c.id AND e.slot_number = s.n AND e.status <> 'FORFEITED')
   ORDER BY s.n
   LIMIT 1;

  IF v_slot IS NULL THEN
    INSERT INTO public.bonus_slot_audit(campaign_id, user_id, event, reason)
    VALUES (v_c.id, p_user, 'slot_denied', 'cap_reached');
    RETURN NULL;
  END IF;

  INSERT INTO public.bonus_campaign_enrolments(
    campaign_id, user_id, eligibility_group, slot_number, account_created_at,
    slot_reserved_at, status, idempotency_key)
  VALUES (
    v_c.id, p_user, 'NEW_USER', v_slot, v_created,
    now(), 'SLOT_RESERVED', 'new_user_bonus_' || to_char(v_c.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD') || ':' || p_user::text)
  ON CONFLICT (campaign_id, user_id) DO NOTHING;

  INSERT INTO public.bonus_slot_audit(campaign_id, user_id, slot_number, event)
  VALUES (v_c.id, p_user, v_slot, 'slot_reserved');

  RETURN v_slot;
END $$;

CREATE OR REPLACE FUNCTION public.bonus_profile_slot_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.auth_provider,'') <> 'anonymous' THEN
    BEGIN
      PERFORM public.bonus_reserve_new_user_slot(NEW.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS bonus_profile_slot_trg ON public.profiles;
CREATE TRIGGER bonus_profile_slot_trg
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.bonus_profile_slot_trg();

-- ============ award ============
CREATE OR REPLACE FUNCTION public.bonus_claim_for_user(p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c public.bonus_campaigns;
  v_created timestamptz;
  v_e public.bonus_campaign_enrolments;
  v_group public.bonus_group;
  v_key text;
  v_txn uuid;
  v_journal uuid;
  v_day text;
BEGIN
  SELECT * INTO v_c FROM public.bonus_active_campaign();
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('awarded', false, 'reason', 'no_campaign'); END IF;
  IF now() < v_c.starts_at THEN RETURN jsonb_build_object('awarded', false, 'reason', 'not_started'); END IF;

  SELECT created_at INTO v_created FROM auth.users WHERE id = p_user;
  IF v_created IS NULL THEN RETURN jsonb_build_object('awarded', false, 'reason', 'unknown_user'); END IF;

  v_day := to_char(v_c.starts_at AT TIME ZONE 'Asia/Kuala_Lumpur', 'YYYYMMDD');
  v_group := CASE WHEN v_created < v_c.starts_at THEN 'EXISTING_USER'::public.bonus_group
                  ELSE 'NEW_USER'::public.bonus_group END;

  IF NOT public.bonus_user_is_valid(p_user, v_c) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'ineligible');
  END IF;
  IF NOT public.bonus_user_is_approved(p_user) THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'not_approved');
  END IF;

  IF v_group = 'EXISTING_USER' THEN
    v_key := 'existing_user_bonus_' || v_day || ':' || p_user::text;
    INSERT INTO public.bonus_campaign_enrolments(
      campaign_id, user_id, eligibility_group, account_created_at, status, idempotency_key)
    VALUES (v_c.id, p_user, 'EXISTING_USER', v_created, 'ELIGIBLE', v_key)
    ON CONFLICT (campaign_id, user_id) DO NOTHING;
  ELSE
    PERFORM public.bonus_reserve_new_user_slot(p_user);
  END IF;

  SELECT * INTO v_e FROM public.bonus_campaign_enrolments
    WHERE campaign_id = v_c.id AND user_id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_slot');
  END IF;
  IF v_e.status = 'AWARDED' THEN
    RETURN jsonb_build_object('awarded', false, 'already', true, 'group', v_e.eligibility_group,
                              'slot', v_e.slot_number, 'amount', v_e.bonus_amount);
  END IF;
  IF v_e.status IN ('FORFEITED','INELIGIBLE','EXPIRED') THEN
    RETURN jsonb_build_object('awarded', false, 'reason', lower(v_e.status::text));
  END IF;

  PERFORM set_config('app.wallet_ctx', 'bonus_grant', true);
  SELECT txn_id INTO v_txn FROM public.wallet_apply_change(
    p_user, 'credit'::wallet_txn_type, v_c.bonus_amount, 'admin_adjustment'::wallet_ref_type,
    v_e.id, 'Campaign bonus: ' || v_c.code, false);
  PERFORM set_config('app.wallet_ctx', 'wager', true);

  SELECT accounting_journal_id INTO v_journal FROM public.wallet_transactions WHERE id = v_txn;

  UPDATE public.bonus_campaign_enrolments
     SET status = 'AWARDED', awarded_at = now(), bonus_amount = v_c.bonus_amount,
         remaining_locked_bonus = (SELECT locked_bonus_balance FROM public.wallets WHERE user_id = p_user),
         journal_transaction_id = COALESCE(v_journal, v_txn), updated_at = now()
   WHERE id = v_e.id;

  INSERT INTO public.bonus_slot_audit(campaign_id, user_id, slot_number, event, metadata)
  VALUES (v_c.id, p_user, v_e.slot_number, 'bonus_awarded',
          jsonb_build_object('amount', v_c.bonus_amount, 'group', v_e.eligibility_group, 'txn', v_txn));

  RETURN jsonb_build_object('awarded', true, 'group', v_e.eligibility_group,
                            'slot', v_e.slot_number, 'amount', v_c.bonus_amount);
END $$;

REVOKE ALL ON FUNCTION public.bonus_claim_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_reserve_new_user_slot(uuid) FROM PUBLIC, anon, authenticated;

-- ============ forfeit ============
CREATE OR REPLACE FUNCTION public.bonus_forfeit_slot(p_user uuid, p_reason text DEFAULT 'invalid_account')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_e public.bonus_campaign_enrolments;
BEGIN
  SELECT * INTO v_e FROM public.bonus_campaign_enrolments
    WHERE user_id = p_user AND status IN ('ELIGIBLE','SLOT_RESERVED') FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.bonus_campaign_enrolments
     SET status = 'FORFEITED', forfeited_at = now(), forfeit_reason = p_reason, updated_at = now()
   WHERE id = v_e.id;
  INSERT INTO public.bonus_slot_audit(campaign_id, user_id, slot_number, event, reason)
  VALUES (v_e.campaign_id, p_user, v_e.slot_number, 'slot_forfeited', p_reason);
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.bonus_forfeit_slot(uuid, text) FROM PUBLIC, anon, authenticated;

-- ============ public campaign status (no user details) ============
CREATE OR REPLACE FUNCTION public.bonus_campaign_status()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c public.bonus_campaigns; v_used integer;
BEGIN
  SELECT * INTO v_c FROM public.bonus_active_campaign();
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('active', false); END IF;
  SELECT count(*) INTO v_used FROM public.bonus_campaign_enrolments
   WHERE campaign_id = v_c.id AND slot_number IS NOT NULL AND status <> 'FORFEITED';
  RETURN jsonb_build_object(
    'active', v_c.enabled AND now() >= v_c.starts_at,
    'code', v_c.code,
    'startsAt', v_c.starts_at,
    'bonusAmount', v_c.bonus_amount,
    'cap', v_c.new_user_cap,
    'slotsTaken', v_used,
    'slotsRemaining', GREATEST(v_c.new_user_cap - v_used, 0));
END $$;
GRANT EXECUTE ON FUNCTION public.bonus_campaign_status() TO anon, authenticated, service_role;

-- ============ withdrawal rules ============
CREATE OR REPLACE FUNCTION public.payout_create_atomic(
  p_user_id uuid, p_bank_name text, p_bank_account_number text, p_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_total numeric; v_locked numeric; v_withdrawable numeric; v_pending numeric; v_id uuid;
BEGIN
  IF p_amount IS NULL OR p_amount < 100 THEN RAISE EXCEPTION 'MIN_WITHDRAWAL_100'; END IF;
  IF ROUND(p_amount, 2) <> p_amount THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;

  IF EXISTS (SELECT 1 FROM public.payout_requests
              WHERE user_id = p_user_id
                AND status IN ('pending','approved','proof_uploaded')) THEN
    RAISE EXCEPTION 'ACTIVE_PAYOUT_EXISTS';
  END IF;

  SELECT balance, locked_bonus_balance INTO v_total, v_locked
    FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_total IS NULL THEN RAISE EXCEPTION 'INSUFFICIENT_WITHDRAWABLE'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_pending FROM public.payout_requests
   WHERE user_id = p_user_id AND status IN ('pending','approved','proof_uploaded');

  v_withdrawable := ROUND(v_total - COALESCE(v_locked,0) - v_pending, 2);

  IF v_withdrawable < 100 THEN RAISE EXCEPTION 'INSUFFICIENT_WITHDRAWABLE'; END IF;
  IF ROUND(v_total, 2) < 200 THEN RAISE EXCEPTION 'INSUFFICIENT_TOTAL'; END IF;
  IF p_amount > v_withdrawable THEN RAISE EXCEPTION 'INSUFFICIENT_WITHDRAWABLE'; END IF;

  INSERT INTO public.payout_requests(user_id, bank_name, bank_account_number, amount, status)
  VALUES (p_user_id, p_bank_name, p_bank_account_number, p_amount, 'pending')
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.payout_create_atomic(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;

-- ============ seed the campaign ============
INSERT INTO public.bonus_campaigns(code, starts_at, bonus_amount, new_user_cap)
VALUES ('launch_bonus_20260820', timestamptz '2026-08-20 00:00:00+08', 100, 100)
ON CONFLICT (code) DO NOTHING;