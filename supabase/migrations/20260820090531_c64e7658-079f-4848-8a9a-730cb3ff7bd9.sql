
-- 1) bonus_campaigns: restrict SELECT to authenticated
DROP POLICY IF EXISTS "campaign readable" ON public.bonus_campaigns;
CREATE POLICY "campaign readable" ON public.bonus_campaigns
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.bonus_campaigns FROM anon;

-- 2) profiles: block self-service edits of privileged columns
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only enforce for ordinary end users editing their own row.
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;
  IF private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.id                     := OLD.id;
  NEW.created_at             := OLD.created_at;
  NEW.suspended              := OLD.suspended;
  NEW.is_simulation          := OLD.is_simulation;
  NEW.risk_factor            := OLD.risk_factor;
  NEW.risk_factor_reason     := OLD.risk_factor_reason;
  NEW.risk_factor_updated_at := OLD.risk_factor_updated_at;
  NEW.comments_banned_at     := OLD.comments_banned_at;
  NEW.comments_banned_by     := OLD.comments_banned_by;
  NEW.public_reference       := OLD.public_reference;
  NEW.referral_code          := OLD.referral_code;
  NEW.auth_provider          := OLD.auth_provider;
  -- referral attribution may only be set once, never rewritten
  IF OLD.referred_by_code IS NOT NULL THEN
    NEW.referred_by_code := OLD.referred_by_code;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_self_update_scope ON public.profiles;
CREATE TRIGGER enforce_profile_self_update_scope
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update_scope();

-- 3) payout_requests: users may only change their decision fields
CREATE OR REPLACE FUNCTION public.enforce_payout_user_update_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> NEW.user_id THEN
    RETURN NEW;
  END IF;
  IF private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  NEW.id                  := OLD.id;
  NEW.user_id             := OLD.user_id;
  NEW.amount              := OLD.amount;
  NEW.bank_name           := OLD.bank_name;
  NEW.bank_account_number := OLD.bank_account_number;
  NEW.reviewed_by         := OLD.reviewed_by;
  NEW.approved_at         := OLD.approved_at;
  NEW.approved_by         := OLD.approved_by;
  NEW.rejected_by         := OLD.rejected_by;
  NEW.rejected_at         := OLD.rejected_at;
  NEW.rejection_reason    := OLD.rejection_reason;
  NEW.completed_at        := OLD.completed_at;
  NEW.completed_by        := OLD.completed_by;
  NEW.proof_file_path     := OLD.proof_file_path;
  NEW.proof_file_name     := OLD.proof_file_name;
  NEW.proof_file_type     := OLD.proof_file_type;
  NEW.proof_file_size     := OLD.proof_file_size;
  NEW.proof_uploaded_at   := OLD.proof_uploaded_at;
  NEW.bank_reference_no   := OLD.bank_reference_no;
  NEW.checker_notes       := OLD.checker_notes;
  NEW.created_at          := OLD.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_payout_user_update_scope ON public.payout_requests;
CREATE TRIGGER enforce_payout_user_update_scope
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_payout_user_update_scope();
