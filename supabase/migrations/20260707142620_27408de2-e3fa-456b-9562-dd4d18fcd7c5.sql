
-- Profiles: add WITH CHECK to self-update policy and enforce column-freeze via trigger
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.prevent_profile_privileged_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow privileged roles and admins to change anything
  IF current_setting('role', true) IN ('service_role','supabase_admin','postgres')
     OR private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-admin self updates: freeze sensitive columns
  IF NEW.suspended IS DISTINCT FROM OLD.suspended
     OR NEW.risk_factor IS DISTINCT FROM OLD.risk_factor
     OR NEW.risk_factor_reason IS DISTINCT FROM OLD.risk_factor_reason
     OR NEW.risk_factor_updated_at IS DISTINCT FROM OLD.risk_factor_updated_at
     OR NEW.force_password_change IS DISTINCT FROM OLD.force_password_change
     OR NEW.is_simulation IS DISTINCT FROM OLD.is_simulation
     OR NEW.auth_provider IS DISTINCT FROM OLD.auth_provider
     OR NEW.public_reference IS DISTINCT FROM OLD.public_reference
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by_code IS DISTINCT FROM OLD.referred_by_code
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Not allowed to modify privileged profile fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_updates ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_updates
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privileged_updates();

-- Support conversations: add WITH CHECK and freeze staff-controlled fields for non-staff owners
DROP POLICY IF EXISTS "user/staff update conversation" ON public.support_conversations;
CREATE POLICY "user/staff update conversation" ON public.support_conversations
  FOR UPDATE TO authenticated
  USING (
    (auth.uid() = user_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (private.has_role(auth.uid(), 'customer_support'::app_role) AND ((status = 'open'::text) OR (claimed_by = auth.uid())))
  )
  WITH CHECK (
    (auth.uid() = user_id)
    OR private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
    OR (private.has_role(auth.uid(), 'customer_support'::app_role) AND ((status = 'open'::text) OR (claimed_by = auth.uid())))
  );

CREATE OR REPLACE FUNCTION public.prevent_support_conv_user_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('role', true) IN ('service_role','supabase_admin','postgres')
     OR private.has_role(auth.uid(), 'admin'::app_role)
     OR private.has_role(auth.uid(), 'super_admin'::app_role)
     OR private.has_role(auth.uid(), 'customer_support'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Non-staff: freeze staff-controlled fields
  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.claimed_by IS DISTINCT FROM OLD.claimed_by
     OR NEW.staff_last_read_at IS DISTINCT FROM OLD.staff_last_read_at
     OR NEW.last_staff_message_at IS DISTINCT FROM OLD.last_staff_message_at
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Not allowed to modify staff-controlled conversation fields' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_conv_prevent_user_updates ON public.support_conversations;
CREATE TRIGGER support_conv_prevent_user_updates
  BEFORE UPDATE ON public.support_conversations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_support_conv_user_updates();
