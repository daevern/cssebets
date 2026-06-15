CREATE OR REPLACE FUNCTION public.mark_tour_complete(p_tour_key text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles
     SET tour_progress = COALESCE(tour_progress, '{}'::jsonb) || jsonb_build_object(p_tour_key, true)
   WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event) VALUES (v_uid, p_tour_key, 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.mark_onboarding_complete()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()) WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event) VALUES (v_uid, 'global', 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.mark_onboarding_skipped()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles SET onboarding_skipped_at = COALESCE(onboarding_skipped_at, now()) WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event) VALUES (v_uid, 'global', 'skipped');
END $$;

CREATE OR REPLACE FUNCTION public.admin_reset_onboarding(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role) OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.profiles
     SET onboarding_completed_at = NULL, onboarding_skipped_at = NULL,
         tour_progress = '{}'::jsonb, onboarding_enabled = true
   WHERE id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_onboarding_enabled(p_user_id uuid, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role) OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.profiles SET onboarding_enabled = p_enabled WHERE id = p_user_id;
END $$;