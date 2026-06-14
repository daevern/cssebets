CREATE OR REPLACE FUNCTION public.payout_user_confirm(p_payout_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_owner uuid;
BEGIN
  SELECT status, user_id INTO v_status, v_owner
    FROM public.payout_requests WHERE id = p_payout_id FOR UPDATE;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_owner <> p_user_id THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF v_status <> 'proof_uploaded' THEN RAISE EXCEPTION 'INVALID_STATUS:%', v_status; END IF;
  UPDATE public.payout_requests
     SET status = 'completed',
         user_decision_at = now(),
         completed_at = now()
   WHERE id = p_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.payout_user_confirm(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.payout_user_confirm(uuid, uuid) TO service_role;