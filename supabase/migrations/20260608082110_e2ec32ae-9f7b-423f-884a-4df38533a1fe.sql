
-- =========================
-- WALLETS
-- =========================
CREATE TABLE public.wallets (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own wallet" ON public.wallets
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================
-- WALLET TRANSACTIONS LEDGER
-- =========================
CREATE TYPE public.wallet_txn_type AS ENUM ('credit','debit','refund','adjustment');
CREATE TYPE public.wallet_ref_type AS ENUM ('point_request','bet_placement','bet_settlement','admin_adjustment');

CREATE TABLE public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.wallet_txn_type NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  balance_before NUMERIC(14,2) NOT NULL,
  balance_after NUMERIC(14,2) NOT NULL,
  reference_type public.wallet_ref_type NOT NULL,
  reference_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX wallet_transactions_user_created_idx ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX wallet_transactions_ref_idx ON public.wallet_transactions(reference_type, reference_id);

GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own txns" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- =========================
-- POINT REQUESTS
-- =========================
CREATE TYPE public.point_request_status AS ENUM ('pending','approved','rejected');

CREATE TABLE public.point_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_amount NUMERIC(14,2) NOT NULL CHECK (requested_amount > 0 AND requested_amount <= 1000000),
  reason TEXT,
  status public.point_request_status NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  review_note TEXT
);

CREATE INDEX point_requests_status_idx ON public.point_requests(status, requested_at DESC);
CREATE INDEX point_requests_user_idx ON public.point_requests(user_id, requested_at DESC);

GRANT SELECT, INSERT ON public.point_requests TO authenticated;
GRANT ALL ON public.point_requests TO service_role;
ALTER TABLE public.point_requests ENABLE ROW LEVEL SECURITY;

-- users can read own requests; admins can read all
CREATE POLICY "read point requests" ON public.point_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- users can create own pending request only (no status spoofing)
CREATE POLICY "users create own pending request" ON public.point_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
  );

-- (no UPDATE/DELETE policies — handled by SECURITY DEFINER functions)

-- =========================
-- ATOMIC WALLET CHANGE FUNCTION
-- =========================
-- Apply a credit / debit / refund / adjustment atomically.
-- - Locks the wallet row (creating it at 0 if missing).
-- - Validates non-negative resulting balance for debits.
-- - Inserts ledger entry with balance_before/after.
-- - Returns (new_balance, txn_id).
CREATE OR REPLACE FUNCTION public.wallet_apply_change(
  p_user_id UUID,
  p_type public.wallet_txn_type,
  p_amount NUMERIC,
  p_reference_type public.wallet_ref_type,
  p_reference_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS TABLE(new_balance NUMERIC, txn_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before NUMERIC;
  v_after NUMERIC;
  v_txn UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'wallet: amount must be positive';
  END IF;

  -- Ensure wallet row exists, then lock it
  INSERT INTO public.wallets(user_id) VALUES (p_user_id)
    ON CONFLICT (user_id) DO NOTHING;

  SELECT balance INTO v_before
  FROM public.wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF p_type = 'debit' THEN
    v_after := v_before - p_amount;
    IF v_after < 0 THEN
      RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
    END IF;
  ELSE
    v_after := v_before + p_amount;
  END IF;

  UPDATE public.wallets
     SET balance = v_after, updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO public.wallet_transactions(
    user_id, type, amount, balance_before, balance_after, reference_type, reference_id, note
  ) VALUES (
    p_user_id, p_type, p_amount, v_before, v_after, p_reference_type, p_reference_id, p_note
  ) RETURNING id INTO v_txn;

  new_balance := v_after;
  txn_id := v_txn;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_apply_change(UUID, public.wallet_txn_type, NUMERIC, public.wallet_ref_type, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_apply_change(UUID, public.wallet_txn_type, NUMERIC, public.wallet_ref_type, UUID, TEXT) TO service_role;

-- =========================
-- APPROVE / REJECT POINT REQUESTS (admin)
-- =========================
CREATE OR REPLACE FUNCTION public.wallet_approve_request(
  p_request_id UUID,
  p_admin_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req public.point_requests%ROWTYPE;
  v_new NUMERIC;
BEGIN
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_req FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status;
  END IF;

  SELECT new_balance INTO v_new FROM public.wallet_apply_change(
    v_req.user_id, 'credit', v_req.requested_amount, 'point_request', v_req.id,
    COALESCE(p_note, 'Approved point request')
  );

  UPDATE public.point_requests
     SET status = 'approved', reviewed_at = now(), reviewed_by = p_admin_id, review_note = p_note
   WHERE id = p_request_id;

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_reject_request(
  p_request_id UUID,
  p_admin_id UUID,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status public.point_request_status;
BEGIN
  IF NOT public.has_role(p_admin_id, 'admin') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT status INTO v_status FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_status;
  END IF;

  UPDATE public.point_requests
     SET status = 'rejected', reviewed_at = now(), reviewed_by = p_admin_id, review_note = p_note
   WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_approve_request(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wallet_reject_request(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_approve_request(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_reject_request(UUID, UUID, TEXT) TO service_role;

-- =========================
-- AUTO-CREATE WALLET ON SIGNUP
-- =========================
CREATE OR REPLACE FUNCTION public.handle_new_user_wallet()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.wallets(user_id) VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_wallet ON auth.users;
CREATE TRIGGER on_auth_user_created_wallet
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_wallet();

-- Backfill wallets for existing users
INSERT INTO public.wallets(user_id)
  SELECT id FROM auth.users
  ON CONFLICT (user_id) DO NOTHING;
