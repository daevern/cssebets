
-- 1) Extend status enum
ALTER TYPE public.point_request_status ADD VALUE IF NOT EXISTS 'pending_upload' BEFORE 'pending';

-- 2) Add proof + workflow columns to point_requests
ALTER TABLE public.point_requests
  ADD COLUMN IF NOT EXISTS proof_file_path text,
  ADD COLUMN IF NOT EXISTS proof_file_name text,
  ADD COLUMN IF NOT EXISTS proof_file_type text,
  ADD COLUMN IF NOT EXISTS proof_file_size integer,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- 3) Storage policies on point-request-proofs (path: point-requests/{user_id}/{request_id}/{filename})
DROP POLICY IF EXISTS "proof_user_insert"  ON storage.objects;
DROP POLICY IF EXISTS "proof_user_select"  ON storage.objects;
DROP POLICY IF EXISTS "proof_user_delete"  ON storage.objects;
DROP POLICY IF EXISTS "proof_admin_select" ON storage.objects;

CREATE POLICY "proof_user_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'point-request-proofs'
  AND (storage.foldername(name))[1] = 'point-requests'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "proof_user_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'point-request-proofs'
  AND (storage.foldername(name))[1] = 'point-requests'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "proof_user_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'point-request-proofs'
  AND (storage.foldername(name))[1] = 'point-requests'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE POLICY "proof_admin_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'point-request-proofs'
  AND private.has_role(auth.uid(), 'admin'::public.app_role)
);
