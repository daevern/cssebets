
-- ============================================================
-- Helper: is the user any staff (customer_support / admin / super_admin)?
-- ============================================================
CREATE OR REPLACE FUNCTION private.has_staff_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role IN ('customer_support'::public.app_role,
                   'admin'::public.app_role,
                   'super_admin'::public.app_role)
  );
$$;

REVOKE ALL ON FUNCTION private.has_staff_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_staff_role(uuid) TO authenticated, service_role;

-- ============================================================
-- Audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS public.support_audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      text,
  action_type     text NOT NULL,
  target_type     text,
  target_id       uuid,
  target_user_id  uuid,
  old_value       jsonb,
  new_value       jsonb,
  reason          text,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_audit_logs_actor_idx
  ON public.support_audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_audit_logs_target_user_idx
  ON public.support_audit_logs (target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_audit_logs_action_idx
  ON public.support_audit_logs (action_type, created_at DESC);

GRANT SELECT, INSERT ON public.support_audit_logs TO authenticated;
GRANT ALL ON public.support_audit_logs TO service_role;

ALTER TABLE public.support_audit_logs ENABLE ROW LEVEL SECURITY;

-- Staff can read audit logs; admins+ see everything, customer_support sees their own
CREATE POLICY "staff read own audit logs"
  ON public.support_audit_logs FOR SELECT
  TO authenticated
  USING (
    actor_id = auth.uid()
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- Staff can insert their own audit rows
CREATE POLICY "staff insert audit logs"
  ON public.support_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND private.has_staff_role(auth.uid())
  );

-- ============================================================
-- Let staff (customer_support / admin / super_admin) read user_roles
-- (needed to list pending registrations from the portal)
-- ============================================================
DROP POLICY IF EXISTS "Staff view all roles" ON public.user_roles;
CREATE POLICY "Staff view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (private.has_staff_role(auth.uid()));

-- ============================================================
-- Let staff read profiles (already permissive: authenticated true) -- no-op
-- Let staff read point_requests
-- ============================================================
DROP POLICY IF EXISTS "staff read point requests" ON public.point_requests;
CREATE POLICY "staff read point requests"
  ON public.point_requests FOR SELECT
  TO authenticated
  USING (private.has_staff_role(auth.uid()));

-- ============================================================
-- Staff-callable point request approve/reject (does NOT require admin role)
-- ============================================================
CREATE OR REPLACE FUNCTION public.staff_approve_point_request(
  p_request_id uuid,
  p_staff_id uuid,
  p_note text DEFAULT NULL
) RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_req public.point_requests%ROWTYPE;
  v_new NUMERIC;
BEGIN
  IF NOT private.has_staff_role(p_staff_id) THEN
    RAISE EXCEPTION 'staff only';
  END IF;

  SELECT * INTO v_req FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_req.user_id = p_staff_id THEN
    RAISE EXCEPTION 'Cannot approve your own request';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_req.status;
  END IF;

  SELECT new_balance INTO v_new FROM public.wallet_apply_change(
    v_req.user_id, 'credit', v_req.requested_amount, 'point_request', v_req.id,
    COALESCE(p_note, 'Approved point request (staff)')
  );

  UPDATE public.point_requests
     SET status = 'approved',
         reviewed_at = now(),
         reviewed_by = p_staff_id,
         review_note = p_note
   WHERE id = p_request_id;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_approve_point_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_approve_point_request(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.staff_reject_point_request(
  p_request_id uuid,
  p_staff_id uuid,
  p_reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_status public.point_request_status;
  v_user uuid;
BEGIN
  IF NOT private.has_staff_role(p_staff_id) THEN
    RAISE EXCEPTION 'staff only';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 1 THEN
    RAISE EXCEPTION 'reason required';
  END IF;

  SELECT status, user_id INTO v_status, v_user FROM public.point_requests
    WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request not found'; END IF;
  IF v_user = p_staff_id THEN
    RAISE EXCEPTION 'Cannot reject your own request';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'request already %', v_status;
  END IF;

  UPDATE public.point_requests
     SET status = 'rejected',
         reviewed_at = now(),
         reviewed_by = p_staff_id,
         review_note = p_reason,
         rejection_reason = p_reason
   WHERE id = p_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.staff_reject_point_request(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_reject_point_request(uuid, uuid, text) TO service_role;
