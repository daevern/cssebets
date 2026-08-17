-- Phase B risk hardening: payout hold-on-create, go-live margin/capacity defaults,
-- deactivate ungradable UFC prop markets, daily CSSE token claim.

-- ---------------------------------------------------------------------------
-- 1) Payout: hold (debit) at create; approve is status-only when already held
-- ---------------------------------------------------------------------------
ALTER TABLE public.payout_requests
  ADD COLUMN IF NOT EXISTS held_at timestamptz;

CREATE OR REPLACE FUNCTION public.payout_create_atomic(
  p_user_id uuid,
  p_bank_name text,
  p_bank_account_number text,
  p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_id uuid;
  v_bal numeric;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payout_requests
     WHERE user_id = p_user_id
       AND status IN ('pending', 'approved', 'proof_uploaded')
  ) THEN
    RAISE EXCEPTION 'ACTIVE_PAYOUT_EXISTS';
  END IF;

  SELECT balance INTO v_bal FROM public.wallets WHERE user_id = p_user_id FOR UPDATE;
  IF v_bal IS NULL OR v_bal < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO public.payout_requests (
    user_id, bank_name, bank_account_number, amount, status, held_at
  ) VALUES (
    p_user_id, p_bank_name, p_bank_account_number, p_amount, 'pending', now()
  )
  RETURNING id INTO v_id;

  PERFORM public.wallet_apply_change(
    p_user_id,
    'debit'::public.wallet_txn_type,
    p_amount,
    'payout'::public.wallet_ref_type,
    v_id,
    'Payout hold — request created',
    false
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.payout_create_atomic(uuid, text, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_create_atomic(uuid, text, text, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.payout_approve_atomic(p_payout_id uuid, p_admin_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_row public.payout_requests%ROWTYPE;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'payout already %', v_row.status; END IF;
  IF v_row.user_id = p_admin_id THEN RAISE EXCEPTION 'cannot approve own payout'; END IF;

  -- Legacy pending rows (pre-hold) still debit here; held rows already debited at create.
  IF v_row.held_at IS NULL THEN
    PERFORM public.wallet_apply_change(
      v_row.user_id, 'debit'::public.wallet_txn_type, v_row.amount,
      'payout'::public.wallet_ref_type, v_row.id, 'Payout approved — points debited', false);
  END IF;

  UPDATE public.payout_requests
     SET status = 'approved',
         approved_at = now(),
         reviewed_by = p_admin_id,
         approved_by = p_admin_id
   WHERE id = p_payout_id;

  RETURN p_payout_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.payout_admin_reject_atomic(
  p_payout_id uuid,
  p_admin_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_row public.payout_requests%ROWTYPE;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout not found'; END IF;
  IF v_row.status <> 'pending' THEN RAISE EXCEPTION 'payout already %', v_row.status; END IF;

  IF v_row.held_at IS NOT NULL THEN
    PERFORM public.wallet_apply_change(
      v_row.user_id, 'credit'::public.wallet_txn_type, v_row.amount,
      'payout'::public.wallet_ref_type, v_row.id,
      'Payout rejected — hold released', false);
  END IF;

  UPDATE public.payout_requests
     SET status = 'rejected_by_admin',
         rejection_reason = p_reason,
         reviewed_by = p_admin_id,
         rejected_by = p_admin_id,
         rejected_at = now()
   WHERE id = p_payout_id;

  RETURN p_payout_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.payout_admin_reject_atomic(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_admin_reject_atomic(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Go-live defaults for fresh / ephemeral DBs (ops still confirms on prod)
-- ---------------------------------------------------------------------------
UPDATE public.platform_settings
   SET apply_margin_to_real = true
 WHERE id = 1 AND coalesce(apply_margin_to_real, false) = false;

UPDATE public.accounting_migration_flags
   SET capacity_enforced = true, updated_at = now()
 WHERE product IN ('plinko', 'rps', 'blackjack', 'roulette', 'treasure',
                   'hilo', 'dice', 'wheel', 'keno', 'crash', 'towers', 'poker')
   AND capacity_enforced = false;

-- ---------------------------------------------------------------------------
-- 3) Stop public UFC props that cannot be auto-graded from the MMA feed
-- ---------------------------------------------------------------------------
UPDATE public.ufc_fight_markets
   SET is_active = false, updated_at = now()
 WHERE market_type IN ('method', 'round', 'total_rounds', 'distance', 'handicap', 'three_way')
   AND is_active = true;

-- ---------------------------------------------------------------------------
-- 4) Daily CSSE token claim (10 tokens / UTC day)
-- ---------------------------------------------------------------------------
ALTER TABLE public.csse_token_wallets
  ADD COLUMN IF NOT EXISTS last_daily_claim_on date;

CREATE OR REPLACE FUNCTION public.claim_daily_csse_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_today date := (timezone('utc', now()))::date;
  v_last date;
  v_amount bigint := 10;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  INSERT INTO public.csse_token_wallets (user_id)
  VALUES (v_uid)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_daily_claim_on INTO v_last
    FROM public.csse_token_wallets
   WHERE user_id = v_uid
   FOR UPDATE;

  IF v_last IS NOT NULL AND v_last = v_today THEN
    RAISE EXCEPTION 'ALREADY_CLAIMED';
  END IF;

  PERFORM public.csse_credit_tokens(
    v_uid,
    v_amount,
    'earn',
    'daily_claim',
    v_today::text,
    jsonb_build_object('day', v_today::text)
  );

  UPDATE public.csse_token_wallets
     SET last_daily_claim_on = v_today
   WHERE user_id = v_uid;

  RETURN jsonb_build_object('ok', true, 'amount', v_amount, 'day', v_today);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_daily_csse_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_daily_csse_tokens() TO authenticated, service_role;
