
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

  PERFORM public.wallet_apply_change(
    v_row.user_id, 'debit'::public.wallet_txn_type, v_row.amount,
    'payout'::public.wallet_ref_type, v_row.id, 'Payout approved — points debited', false);

  UPDATE public.payout_requests
     SET status = 'approved',
         approved_at = now(),
         reviewed_by = p_admin_id,
         approved_by = p_admin_id
   WHERE id = p_payout_id;

  RETURN p_payout_id;
END $function$;
