
CREATE OR REPLACE FUNCTION public.guard_profiles_user_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Privileged callers (service role / staff) bypass column restrictions
  IF auth.uid() IS NULL
     OR private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'customer_support'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.is_simulation IS DISTINCT FROM OLD.is_simulation
     OR NEW.risk_factor IS DISTINCT FROM OLD.risk_factor
     OR NEW.risk_factor_reason IS DISTINCT FROM OLD.risk_factor_reason
     OR NEW.risk_factor_updated_at IS DISTINCT FROM OLD.risk_factor_updated_at
     OR NEW.force_password_change IS DISTINCT FROM OLD.force_password_change
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code
     OR NEW.public_reference IS DISTINCT FROM OLD.public_reference
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed to modify administrative profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profiles_user_columns ON public.profiles;
CREATE TRIGGER guard_profiles_user_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_user_columns();

CREATE OR REPLACE FUNCTION public.guard_support_conversation_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'customer_support'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Regular owner: may only update their own read marker
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
     OR NEW.staff_last_read_at IS DISTINCT FROM OLD.staff_last_read_at
     OR NEW.last_staff_message_at IS DISTINCT FROM OLD.last_staff_message_at
     OR NEW.last_user_message_at IS DISTINCT FROM OLD.last_user_message_at
     OR NEW.last_message_at IS DISTINCT FROM OLD.last_message_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Not allowed to modify staff-controlled conversation fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_support_conversation_columns ON public.support_conversations;
CREATE TRIGGER guard_support_conversation_columns
BEFORE UPDATE ON public.support_conversations
FOR EACH ROW EXECUTE FUNCTION public.guard_support_conversation_columns();
