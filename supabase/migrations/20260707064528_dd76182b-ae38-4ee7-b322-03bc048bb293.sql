
CREATE OR REPLACE FUNCTION public.prevent_profile_sensitive_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only guard self-updates by the row owner acting as an authenticated user.
  -- Admin/staff paths use SECURITY DEFINER functions or service_role and bypass this check.
  IF auth.uid() IS NULL OR auth.uid() <> NEW.id THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin')
     OR public.has_role(auth.uid(), 'super_admin') THEN
    RETURN NEW;
  END IF;

  -- Force sensitive columns to retain their previous values on self-update.
  NEW.suspended := OLD.suspended;
  NEW.risk_factor := OLD.risk_factor;
  NEW.risk_factor_reason := OLD.risk_factor_reason;
  NEW.force_password_change := OLD.force_password_change;
  NEW.referral_code := OLD.referral_code;
  NEW.referred_by_code := OLD.referred_by_code;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_sensitive_self_update ON public.profiles;
CREATE TRIGGER profiles_prevent_sensitive_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_sensitive_self_update();
