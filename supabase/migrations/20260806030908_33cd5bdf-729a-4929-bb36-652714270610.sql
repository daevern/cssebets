-- 1. Activation audit log ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.arcade_config_activation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product text NOT NULL,
  environment public.acct_environment NOT NULL,
  previous_version integer,
  new_version integer NOT NULL,
  action text NOT NULL CHECK (action IN ('PROMOTE','ROLLBACK')),
  reason text NOT NULL,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.arcade_config_activation_log TO authenticated;
GRANT ALL ON public.arcade_config_activation_log TO service_role;

ALTER TABLE public.arcade_config_activation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read arcade config activation log"
  ON public.arcade_config_activation_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2. Lock down direct activation writes ----------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.arcade_config_activation FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.arcade_config_versions FROM authenticated;

-- 3. Fail-safe resolution -------------------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_config_version_in_env(
  p_product text,
  p_env public.acct_environment
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  SELECT a.config_version INTO v
    FROM public.arcade_config_activation a
   WHERE a.product = p_product AND a.environment = p_env;
  IF v IS NULL THEN
    RAISE EXCEPTION 'ARCADE_CONFIG_NOT_ACTIVATED: % in %', p_product, p_env
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_config_version_for(p_product text, p_user uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.arcade_config_version_in_env(
    p_product,
    COALESCE(public.accounting_user_env(p_user), 'PRODUCTION'::public.acct_environment)
  );
END;
$$;

-- 4. Immutable per-round configuration -----------------------------------
CREATE OR REPLACE FUNCTION public.arcade_round_config_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'arcade_rps_rounds' THEN
    IF NEW.config_id IS DISTINCT FROM OLD.config_id
       OR NEW.config_version IS DISTINCT FROM OLD.config_version THEN
      RAISE EXCEPTION 'ROUND_CONFIG_IMMUTABLE: rps round % config cannot change', OLD.id;
    END IF;
  ELSIF TG_TABLE_NAME = 'arcade_plinko_games' THEN
    IF NEW.profile_id IS DISTINCT FROM OLD.profile_id THEN
      RAISE EXCEPTION 'ROUND_CONFIG_IMMUTABLE: plinko game % profile cannot change', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS arcade_rps_config_immutable ON public.arcade_rps_rounds;
CREATE TRIGGER arcade_rps_config_immutable
  BEFORE UPDATE ON public.arcade_rps_rounds
  FOR EACH ROW EXECUTE FUNCTION public.arcade_round_config_immutable();

DROP TRIGGER IF EXISTS arcade_plinko_config_immutable ON public.arcade_plinko_games;
CREATE TRIGGER arcade_plinko_config_immutable
  BEFORE UPDATE ON public.arcade_plinko_games
  FOR EACH ROW EXECUTE FUNCTION public.arcade_round_config_immutable();

-- 5. Protected promotion / rollback --------------------------------------
CREATE OR REPLACE FUNCTION public.arcade_promote_config(
  p_product text,
  p_environment public.acct_environment,
  p_version integer,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_prev  integer;
BEGIN
  IF v_actor IS NULL
     OR NOT (public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required to promote arcade configuration';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 4 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.arcade_config_versions v
                  WHERE v.product = p_product AND v.version = p_version) THEN
    RAISE EXCEPTION 'UNKNOWN_CONFIG_VERSION: % v%', p_product, p_version;
  END IF;

  SELECT a.config_version INTO v_prev
    FROM public.arcade_config_activation a
   WHERE a.product = p_product AND a.environment = p_environment
     FOR UPDATE;

  INSERT INTO public.arcade_config_activation
        (product, environment, config_version, reason, activated_by, activated_at)
  VALUES (p_product, p_environment, p_version, p_reason, v_actor, now())
  ON CONFLICT (product, environment) DO UPDATE
     SET config_version = EXCLUDED.config_version,
         reason         = EXCLUDED.reason,
         activated_by   = EXCLUDED.activated_by,
         activated_at   = EXCLUDED.activated_at;

  INSERT INTO public.arcade_config_activation_log
        (product, environment, previous_version, new_version, action, reason, actor)
  VALUES (p_product, p_environment, v_prev, p_version, 'PROMOTE', p_reason, v_actor);

  RETURN jsonb_build_object('product', p_product, 'environment', p_environment,
                            'previous_version', v_prev, 'new_version', p_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_rollback_config(
  p_product text,
  p_environment public.acct_environment,
  p_reason text
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_prev  integer;
  v_curr  integer;
BEGIN
  IF v_actor IS NULL
     OR NOT (public.has_role(v_actor, 'admin') OR public.has_role(v_actor, 'super_admin')) THEN
    RAISE EXCEPTION 'FORBIDDEN: admin role required to roll back arcade configuration';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 4 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;

  SELECT a.config_version INTO v_curr
    FROM public.arcade_config_activation a
   WHERE a.product = p_product AND a.environment = p_environment
     FOR UPDATE;

  SELECT l.previous_version INTO v_prev
    FROM public.arcade_config_activation_log l
   WHERE l.product = p_product AND l.environment = p_environment
     AND l.previous_version IS NOT NULL
   ORDER BY l.created_at DESC
   LIMIT 1;

  IF v_prev IS NULL THEN
    RAISE EXCEPTION 'NO_PREVIOUS_VERSION: nothing to roll back for % in %', p_product, p_environment;
  END IF;

  UPDATE public.arcade_config_activation
     SET config_version = v_prev, reason = p_reason,
         activated_by = v_actor, activated_at = now()
   WHERE product = p_product AND environment = p_environment;

  INSERT INTO public.arcade_config_activation_log
        (product, environment, previous_version, new_version, action, reason, actor)
  VALUES (p_product, p_environment, v_curr, v_prev, 'ROLLBACK', p_reason, v_actor);

  RETURN jsonb_build_object('product', p_product, 'environment', p_environment,
                            'previous_version', v_curr, 'new_version', v_prev);
END;
$$;

REVOKE ALL ON FUNCTION public.arcade_promote_config(text, public.acct_environment, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.arcade_rollback_config(text, public.acct_environment, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.arcade_promote_config(text, public.acct_environment, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_rollback_config(text, public.acct_environment, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.arcade_config_version_in_env(text, public.acct_environment) TO authenticated, service_role;

-- 6. Exposure enforcement for the arcade products -------------------------
UPDATE public.accounting_migration_flags
   SET capacity_enforced = true, updated_at = now()
 WHERE product IN ('plinko','rps','blackjack');