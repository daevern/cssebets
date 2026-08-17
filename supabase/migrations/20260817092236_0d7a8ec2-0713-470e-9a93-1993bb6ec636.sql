CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF coalesce(current_setting('app.demo_guest_reset', true), '') = 'on'
     OR private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

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
$function$;