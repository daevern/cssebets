
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow admins/super_admins to change anything
  IF private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For self-updates, preserve admin-controlled fields
  IF NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.risk_factor IS DISTINCT FROM OLD.risk_factor
     OR NEW.risk_factor_reason IS DISTINCT FROM OLD.risk_factor_reason
     OR NEW.risk_factor_updated_at IS DISTINCT FROM OLD.risk_factor_updated_at
     OR NEW.force_password_change IS DISTINCT FROM OLD.force_password_change
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code
     OR NEW.is_simulation IS DISTINCT FROM OLD.is_simulation
     OR NEW.public_reference IS DISTINCT FROM OLD.public_reference
     OR NEW.auth_provider IS DISTINCT FROM OLD.auth_provider
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Not allowed to modify admin-controlled profile fields'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privilege_escalation ON public.profiles;
CREATE TRIGGER profiles_prevent_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();
