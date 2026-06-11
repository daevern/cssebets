
-- Extend wallet_ref_type with 'payout'
ALTER TYPE public.wallet_ref_type ADD VALUE IF NOT EXISTS 'payout';

-- Payout request status
DO $$ BEGIN
  CREATE TYPE public.payout_request_status AS ENUM (
    'pending',            -- awaiting admin approval
    'approved',           -- admin approved, points debited, awaiting proof
    'proof_uploaded',     -- admin uploaded proof, awaiting user confirmation
    'completed',          -- user approved proof
    'rejected_by_admin',  -- admin rejected before debit
    'rejected_by_user'    -- user rejected proof; points refunded
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- payout_requests table
CREATE TABLE IF NOT EXISTS public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_name text NOT NULL,
  bank_account_number text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  status public.payout_request_status NOT NULL DEFAULT 'pending',

  reviewed_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  rejection_reason text,

  proof_file_path text,
  proof_file_name text,
  proof_file_type text,
  proof_file_size integer,
  proof_uploaded_at timestamptz,

  user_decision_at timestamptz,
  user_rejection_reason text,
  completed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own
CREATE POLICY "users read own payouts" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::public.app_role));

-- Users can create their own pending requests
CREATE POLICY "users create own pending payout" ON public.payout_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND approved_at IS NULL
  );

-- Users can update their own to set proof decision (approve/reject) on proof_uploaded rows
CREATE POLICY "users decide on own proof" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND status = 'proof_uploaded')
  WITH CHECK (user_id = auth.uid() AND status IN ('completed','rejected_by_user'));

-- Admins can update anything
CREATE POLICY "admins update payouts" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));

-- Updated_at trigger
CREATE TRIGGER payout_requests_touch_updated_at
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage RLS for payout-proofs bucket
-- Users can read their own folder; admins can read all
CREATE POLICY "users read own payout proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payout-proofs' AND (
      (storage.foldername(name))[1] = 'payouts'
      AND (
        (storage.foldername(name))[2] = auth.uid()::text
        OR private.has_role(auth.uid(), 'admin'::public.app_role)
      )
    )
  );

-- Admins upload proofs into payouts/{user_id}/{request_id}/
CREATE POLICY "admins upload payout proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payout-proofs'
    AND (storage.foldername(name))[1] = 'payouts'
    AND private.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "admins update payout proofs"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'payout-proofs' AND private.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "admins delete payout proofs"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payout-proofs' AND private.has_role(auth.uid(), 'admin'::public.app_role));
