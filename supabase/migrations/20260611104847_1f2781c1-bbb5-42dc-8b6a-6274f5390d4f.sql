
DROP POLICY IF EXISTS "users create own pending request" ON public.point_requests;

CREATE POLICY "users create own draft or pending request" ON public.point_requests
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('pending_upload'::public.point_request_status, 'pending'::public.point_request_status)
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
);

DROP POLICY IF EXISTS "users update own draft request" ON public.point_requests;
CREATE POLICY "users update own draft request" ON public.point_requests
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending_upload'::public.point_request_status)
WITH CHECK (
  auth.uid() = user_id
  AND status IN ('pending_upload'::public.point_request_status, 'pending'::public.point_request_status)
  AND reviewed_at IS NULL
  AND reviewed_by IS NULL
);

DROP POLICY IF EXISTS "users delete own draft request" ON public.point_requests;
CREATE POLICY "users delete own draft request" ON public.point_requests
FOR DELETE TO authenticated
USING (auth.uid() = user_id AND status = 'pending_upload'::public.point_request_status);
