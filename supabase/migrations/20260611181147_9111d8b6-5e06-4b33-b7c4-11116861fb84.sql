CREATE OR REPLACE FUNCTION public.wallet_approve_request(p_request_id uuid, p_admin_id uuid, p_note text DEFAULT NULL::text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_req public.point_requests%ROWTYPE;
  v_new NUMERIC;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_req FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status;
  END IF;
  IF v_req.user_id = p_admin_id THEN
    RAISE EXCEPTION 'cannot approve your own point request';
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
$function$;

CREATE OR REPLACE FUNCTION public.wallet_reject_request(p_request_id uuid, p_admin_id uuid, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_req public.point_requests%ROWTYPE;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_req FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status;
  END IF;
  IF v_req.user_id = p_admin_id THEN
    RAISE EXCEPTION 'cannot reject your own point request';
  END IF;

  UPDATE public.point_requests
     SET status = 'rejected', reviewed_at = now(), reviewed_by = p_admin_id, review_note = p_note
   WHERE id = p_request_id;
END;
$function$;