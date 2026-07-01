
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS allow_single_admin_self_approval boolean NOT NULL DEFAULT false;

ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS completed_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS bank_reference_no text,
  ADD COLUMN IF NOT EXISTS checker_notes text;

CREATE TABLE IF NOT EXISTS public.wallet_adjustment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  requested_by uuid NOT NULL,
  approved_by uuid,
  rejected_by uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('credit', 'debit')),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'applied', 'cancelled')),
  before_balance numeric,
  after_balance numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  rejection_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT, UPDATE ON public.wallet_adjustment_requests TO authenticated;
GRANT ALL ON public.wallet_adjustment_requests TO service_role;

ALTER TABLE public.wallet_adjustment_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read wallet adjustment requests" ON public.wallet_adjustment_requests;
CREATE POLICY "admins read wallet adjustment requests"
  ON public.wallet_adjustment_requests
  FOR SELECT
  TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE INDEX IF NOT EXISTS wallet_adjustment_requests_status_idx
  ON public.wallet_adjustment_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_adjustment_requests_target_idx
  ON public.wallet_adjustment_requests (target_user_id);

CREATE OR REPLACE FUNCTION public._is_admin_maker_checker(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, private
AS $$
  SELECT private.has_role(_uid, 'admin'::public.app_role)
      OR private.has_role(_uid, 'super_admin'::public.app_role);
$$;

CREATE OR REPLACE FUNCTION public.request_wallet_adjustment(
  p_target_user_id uuid,
  p_amount numeric,
  p_adjustment_type text,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req_id uuid;
  v_balance numeric;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public._is_admin_maker_checker(v_admin) THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_adjustment_type NOT IN ('credit','debit') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;

  SELECT balance INTO v_balance FROM public.wallets WHERE user_id = p_target_user_id;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'TARGET_WALLET_NOT_FOUND'; END IF;

  IF p_adjustment_type = 'debit' AND v_balance - p_amount < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO public.wallet_adjustment_requests
    (target_user_id, requested_by, amount, adjustment_type, reason, before_balance)
  VALUES
    (p_target_user_id, v_admin, p_amount, p_adjustment_type, btrim(p_reason), v_balance)
  RETURNING id INTO v_req_id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, target_user_id, metadata)
  VALUES (v_admin, 'wallet_adjustment_requested', 'wallet_adjustment_request', v_req_id, p_target_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'adjustment_type', p_adjustment_type,
      'reason', btrim(p_reason),
      'before_balance', v_balance
    ));

  RETURN jsonb_build_object('ok', true, 'request_id', v_req_id);
END; $$;

REVOKE ALL ON FUNCTION public.request_wallet_adjustment(uuid,numeric,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.request_wallet_adjustment(uuid,numeric,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_wallet_adjustment(
  p_request_id uuid,
  p_checker_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req public.wallet_adjustment_requests%ROWTYPE;
  v_allow_self boolean;
  v_self boolean;
  v_new_balance numeric;
  v_category text;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public._is_admin_maker_checker(v_admin) THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;

  SELECT * INTO v_req FROM public.wallet_adjustment_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS:%', v_req.status; END IF;

  SELECT COALESCE(allow_single_admin_self_approval, false) INTO v_allow_self
    FROM public.platform_settings WHERE id = 1;
  v_self := (v_req.requested_by = v_admin);
  IF v_self AND NOT COALESCE(v_allow_self, false) THEN
    RAISE EXCEPTION 'SELF_APPROVAL_BLOCKED';
  END IF;

  v_category := CASE WHEN v_req.adjustment_type = 'credit'
                     THEN 'admin_adjustment_credit'
                     ELSE 'admin_adjustment_debit' END;

  PERFORM public.wallet_apply_change(
    p_user_id => v_req.target_user_id,
    p_type => v_req.adjustment_type::public.wallet_txn_type,
    p_amount => v_req.amount,
    p_reference_type => 'admin_adjustment'::public.wallet_ref_type,
    p_reference_id => v_req.id,
    p_note => COALESCE(p_checker_note, v_req.reason)
  );

  SELECT balance INTO v_new_balance FROM public.wallets WHERE user_id = v_req.target_user_id;

  UPDATE public.wallet_transactions
     SET transaction_category = v_category,
         admin_action_id = v_req.id,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
           'wallet_adjustment_request_id', v_req.id,
           'approved_by', v_admin,
           'requested_by', v_req.requested_by,
           'self_approval', v_self,
           'self_approval_allowed', COALESCE(v_allow_self,false)
         )
   WHERE reference_type = 'admin_adjustment'
     AND reference_id = v_req.id;

  UPDATE public.wallet_adjustment_requests
     SET status = 'applied',
         approved_by = v_admin,
         approved_at = now(),
         applied_at = now(),
         after_balance = v_new_balance,
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object(
           'checker_note', p_checker_note,
           'self_approval', v_self,
           'self_approval_allowed', COALESCE(v_allow_self,false)
         )
   WHERE id = v_req.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, target_user_id, metadata)
  VALUES (v_admin, 'wallet_adjustment_approved', 'wallet_adjustment_request', v_req.id, v_req.target_user_id,
    jsonb_build_object(
      'amount', v_req.amount,
      'adjustment_type', v_req.adjustment_type,
      'requested_by', v_req.requested_by,
      'approved_by', v_admin,
      'self_approval', v_self,
      'self_approval_allowed', COALESCE(v_allow_self,false),
      'before_balance', v_req.before_balance,
      'after_balance', v_new_balance,
      'checker_note', p_checker_note
    ));

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, target_user_id, metadata)
  VALUES (v_admin, 'wallet_adjustment_applied', 'wallet_adjustment_request', v_req.id, v_req.target_user_id,
    jsonb_build_object('amount', v_req.amount, 'adjustment_type', v_req.adjustment_type, 'after_balance', v_new_balance));

  RETURN jsonb_build_object('ok', true, 'new_balance', v_new_balance, 'self_approval', v_self);
END; $$;

REVOKE ALL ON FUNCTION public.approve_wallet_adjustment(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_wallet_adjustment(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_wallet_adjustment(
  p_request_id uuid,
  p_rejection_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req public.wallet_adjustment_requests%ROWTYPE;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public._is_admin_maker_checker(v_admin) THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;
  IF p_rejection_reason IS NULL OR length(btrim(p_rejection_reason)) < 3 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED';
  END IF;

  SELECT * INTO v_req FROM public.wallet_adjustment_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS:%', v_req.status; END IF;

  UPDATE public.wallet_adjustment_requests
     SET status = 'rejected',
         rejected_by = v_admin,
         rejected_at = now(),
         rejection_reason = btrim(p_rejection_reason)
   WHERE id = v_req.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, target_user_id, metadata)
  VALUES (v_admin, 'wallet_adjustment_rejected', 'wallet_adjustment_request', v_req.id, v_req.target_user_id,
    jsonb_build_object(
      'requested_by', v_req.requested_by,
      'rejected_by', v_admin,
      'rejection_reason', btrim(p_rejection_reason),
      'amount', v_req.amount,
      'adjustment_type', v_req.adjustment_type
    ));

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.reject_wallet_adjustment(uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_wallet_adjustment(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancel_wallet_adjustment(
  p_request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_req public.wallet_adjustment_requests%ROWTYPE;
BEGIN
  IF v_admin IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public._is_admin_maker_checker(v_admin) THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;

  SELECT * INTO v_req FROM public.wallet_adjustment_requests
   WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'INVALID_STATUS:%', v_req.status; END IF;
  IF v_req.requested_by <> v_admin AND NOT private.has_role(v_admin,'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'ONLY_REQUESTER_OR_SUPER_ADMIN_CAN_CANCEL';
  END IF;

  UPDATE public.wallet_adjustment_requests
     SET status = 'cancelled'
   WHERE id = v_req.id;

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, target_user_id, metadata)
  VALUES (v_admin, 'wallet_adjustment_cancelled', 'wallet_adjustment_request', v_req.id, v_req.target_user_id,
    jsonb_build_object('requested_by', v_req.requested_by, 'cancelled_by', v_admin));

  RETURN jsonb_build_object('ok', true);
END; $$;

REVOKE ALL ON FUNCTION public.cancel_wallet_adjustment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_wallet_adjustment(uuid) TO authenticated;
