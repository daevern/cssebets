
-- 1. Profile columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_skipped_at timestamptz,
  ADD COLUMN IF NOT EXISTS tour_progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS onboarding_enabled boolean NOT NULL DEFAULT true;

-- 2. onboarding_events
CREATE TABLE IF NOT EXISTS public.onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tour_key text NOT NULL,
  event text NOT NULL CHECK (event IN ('started','completed','skipped','step_viewed')),
  step_index int,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.onboarding_events TO authenticated;
GRANT ALL ON public.onboarding_events TO service_role;
ALTER TABLE public.onboarding_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users insert own onboarding events"
  ON public.onboarding_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users read own onboarding events"
  ON public.onboarding_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "admins read all onboarding events"
  ON public.onboarding_events FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE INDEX IF NOT EXISTS idx_onboarding_events_user ON public.onboarding_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_events_tour ON public.onboarding_events(tour_key, event);

-- 3. onboarding_settings (singleton)
CREATE TABLE IF NOT EXISTS public.onboarding_settings (
  id int PRIMARY KEY DEFAULT 1,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT onboarding_settings_singleton CHECK (id = 1)
);
GRANT SELECT ON public.onboarding_settings TO authenticated;
GRANT ALL ON public.onboarding_settings TO service_role;
ALTER TABLE public.onboarding_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read onboarding settings"
  ON public.onboarding_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins update onboarding settings"
  ON public.onboarding_settings FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role)
      OR private.has_role(auth.uid(), 'super_admin'::public.app_role));

INSERT INTO public.onboarding_settings(id, enabled) VALUES (1, true)
  ON CONFLICT (id) DO NOTHING;

-- 4. RPCs
CREATE OR REPLACE FUNCTION public.mark_tour_complete(p_tour_key text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles
     SET tour_progress = COALESCE(tour_progress, '{}'::jsonb)
                       || jsonb_build_object(p_tour_key, true),
         updated_at = now()
   WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event)
    VALUES (v_uid, p_tour_key, 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.mark_onboarding_complete()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles
     SET onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
         updated_at = now()
   WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event)
    VALUES (v_uid, 'global', 'completed');
END $$;

CREATE OR REPLACE FUNCTION public.mark_onboarding_skipped()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.profiles
     SET onboarding_skipped_at = COALESCE(onboarding_skipped_at, now()),
         updated_at = now()
   WHERE id = v_uid;
  INSERT INTO public.onboarding_events(user_id, tour_key, event)
    VALUES (v_uid, 'global', 'skipped');
END $$;

CREATE OR REPLACE FUNCTION public.log_onboarding_event(p_tour_key text, p_event text, p_step_index int DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF p_event NOT IN ('started','completed','skipped','step_viewed') THEN
    RAISE EXCEPTION 'invalid event';
  END IF;
  INSERT INTO public.onboarding_events(user_id, tour_key, event, step_index, metadata)
    VALUES (v_uid, p_tour_key, p_event, p_step_index, COALESCE(p_metadata,'{}'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.admin_reset_onboarding(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role)
       OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.profiles
     SET onboarding_completed_at = NULL,
         onboarding_skipped_at = NULL,
         tour_progress = '{}'::jsonb,
         onboarding_enabled = true,
         updated_at = now()
   WHERE id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_onboarding_enabled(p_user_id uuid, p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role)
       OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.profiles SET onboarding_enabled = p_enabled, updated_at = now() WHERE id = p_user_id;
END $$;

CREATE OR REPLACE FUNCTION public.admin_set_global_onboarding(p_enabled boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role)
       OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  UPDATE public.onboarding_settings SET enabled = p_enabled, updated_by = v_uid, updated_at = now() WHERE id = 1;
END $$;

CREATE OR REPLACE FUNCTION public.get_onboarding_completion_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total int;
  v_completed int;
  v_skipped int;
  v_per_tour jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  IF NOT (private.has_role(v_uid, 'admin'::public.app_role)
       OR private.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.profiles;
  SELECT COUNT(*) INTO v_completed FROM public.profiles WHERE onboarding_completed_at IS NOT NULL;
  SELECT COUNT(*) INTO v_skipped FROM public.profiles WHERE onboarding_skipped_at IS NOT NULL;

  SELECT jsonb_object_agg(tour_key, cnt) INTO v_per_tour FROM (
    SELECT tour_key, COUNT(*) AS cnt
      FROM public.onboarding_events
     WHERE event = 'completed'
     GROUP BY tour_key
  ) t;

  RETURN jsonb_build_object(
    'total_users', v_total,
    'completed', v_completed,
    'skipped', v_skipped,
    'completion_rate', CASE WHEN v_total > 0 THEN ROUND(v_completed::numeric * 100 / v_total, 2) ELSE 0 END,
    'per_tour_completed', COALESCE(v_per_tour, '{}'::jsonb)
  );
END $$;
