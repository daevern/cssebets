-- ============ 4. Preserve reservation history ============
ALTER TABLE public.accounting_liability_reservations
  ADD COLUMN IF NOT EXISTS initial_reserved_amount numeric(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reserved_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS superseded_at timestamptz;

UPDATE public.accounting_liability_reservations
   SET initial_reserved_amount = max_net_liability
 WHERE initial_reserved_amount = 0 AND max_net_liability > 0;

UPDATE public.accounting_liability_reservations
   SET reserved_at = created_at
 WHERE reserved_at <> created_at;

-- ============ 5. Reopen / regrade: versioned reservations ============
ALTER TABLE public.accounting_liability_reservations
  DROP CONSTRAINT IF EXISTS acct_liab_ref_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS acct_liab_ref_active_uniq
  ON public.accounting_liability_reservations (reference_type, reference_id)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS acct_liab_ref_version_uniq
  ON public.accounting_liability_reservations (reference_type, reference_id, version);

CREATE OR REPLACE FUNCTION public.accounting_reserve_liability(
  p_product text, p_game text, p_reference_type text, p_reference_id uuid, p_user uuid,
  p_max_gross numeric, p_stake numeric, p_config_version text DEFAULT NULL::text,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_settled boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_env public.acct_environment;
  v_net numeric(18,2);
  v_counts boolean;
  v_id uuid;
  v_version integer;
BEGIN
  v_env := coalesce(public.accounting_user_env(p_user), 'PRODUCTION');
  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  SELECT coalesce(f.liability_enforced,false) INTO v_counts
    FROM public.accounting_migration_flags f WHERE f.product = p_product;

  SELECT coalesce(max(version),0) + 1 INTO v_version
    FROM public.accounting_liability_reservations
   WHERE reference_type = p_reference_type AND reference_id = p_reference_id;

  INSERT INTO public.accounting_liability_reservations(
    environment, product, game, reference_type, reference_id, user_id,
    max_gross_payout, stake_collected, max_net_liability, reserved_amount,
    initial_reserved_amount, reserved_at, version,
    counts_toward_available, status, release_reason, released_at,
    config_version, metadata)
  VALUES (v_env, p_product, coalesce(p_game, p_product), p_reference_type, p_reference_id, p_user,
    round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2), v_net,
    CASE WHEN p_settled THEN 0 ELSE v_net END,
    v_net, now(), v_version,
    coalesce(v_counts,false),
    CASE WHEN p_settled THEN 'RELEASED' ELSE 'ACTIVE' END,
    CASE WHEN p_settled THEN 'SETTLED_SAME_TRANSACTION' END,
    CASE WHEN p_settled THEN now() END,
    p_config_version, coalesce(p_metadata,'{}'::jsonb))
  ON CONFLICT (reference_type, reference_id) WHERE status = 'ACTIVE'
  DO UPDATE
     SET max_gross_payout = excluded.max_gross_payout,
         stake_collected  = excluded.stake_collected,
         max_net_liability = excluded.max_net_liability,
         initial_reserved_amount = greatest(public.accounting_liability_reservations.initial_reserved_amount,
                                            excluded.max_net_liability),
         reserved_amount = excluded.reserved_amount,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- release: keep the historical hold, zero only the live figure
CREATE OR REPLACE FUNCTION public.accounting_release_liability(
  p_reference_type text, p_reference_id uuid, p_reason text DEFAULT 'SETTLED'::text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  UPDATE public.accounting_liability_reservations
     SET status = 'RELEASED',
         initial_reserved_amount = greatest(initial_reserved_amount, reserved_amount),
         reserved_amount = 0,
         release_reason = coalesce(p_reason,'SETTLED'),
         released_at = now(),
         superseded_at = now(),
         updated_at = now()
   WHERE reference_type = p_reference_type AND reference_id = p_reference_id
     AND status = 'ACTIVE';
$function$;

-- ============ 3. Migration-flag safeguards ============
CREATE OR REPLACE FUNCTION public.accounting_flag_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_env public.acct_environment;
  v_shadow numeric(18,2);
  v_avail numeric(18,2);
  v_open integer;
BEGIN
  IF NEW.liability_enforced IS NOT DISTINCT FROM OLD.liability_enforced THEN
    RETURN NEW;
  END IF;

  -- maker-checker: only an authenticated admin (or internal migration context)
  IF NOT public.accounting_internal_ctx() THEN
    IF v_uid IS NULL OR NOT public._is_admin_maker_checker(v_uid) THEN
      RAISE EXCEPTION 'FLAG_GUARD: liability_enforced for % may only be changed by an admin', NEW.product;
    END IF;
  END IF;

  IF NEW.liability_enforced THEN
    -- enabling: projected available reserve must stay non-negative in every environment
    FOR v_env IN SELECT DISTINCT environment FROM public.accounting_liability_reservations
                  WHERE product = NEW.product AND status = 'ACTIVE'
    LOOP
      SELECT coalesce(sum(reserved_amount),0)::numeric(18,2) INTO v_shadow
        FROM public.accounting_liability_reservations
       WHERE product = NEW.product AND environment = v_env
         AND status = 'ACTIVE' AND NOT counts_toward_available;
      v_avail := public.accounting_available_reserve(v_env);
      IF v_avail - v_shadow < 0 THEN
        RAISE EXCEPTION 'FLAG_GUARD: enabling % in % would leave available reserve % (shadow liability %)',
          NEW.product, v_env, v_avail - v_shadow, v_shadow;
      END IF;
    END LOOP;
  ELSE
    -- disabling: refuse while genuine liabilities are still open
    SELECT count(*) INTO v_open FROM public.accounting_liability_reservations
     WHERE product = NEW.product AND status = 'ACTIVE' AND reserved_amount > 0;
    IF v_open > 0 THEN
      RAISE EXCEPTION 'FLAG_GUARD: cannot disable liability_enforced for % while % active reservation(s) hold reserve',
        NEW.product, v_open;
    END IF;
  END IF;

  INSERT INTO public.audit_log(action, table_name, record_id, actor_id, old_values, new_values)
  VALUES ('accounting_liability_enforced_change', 'accounting_migration_flags', NULL, v_uid,
          jsonb_build_object('product', OLD.product, 'liability_enforced', OLD.liability_enforced),
          jsonb_build_object('product', NEW.product, 'liability_enforced', NEW.liability_enforced));

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS accounting_flag_guard_trg ON public.accounting_migration_flags;
CREATE TRIGGER accounting_flag_guard_trg
  BEFORE UPDATE ON public.accounting_migration_flags
  FOR EACH ROW EXECUTE FUNCTION public.accounting_flag_guard();

-- keep open reservations in sync with the flag
CREATE OR REPLACE FUNCTION public.accounting_flag_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.liability_enforced IS DISTINCT FROM OLD.liability_enforced THEN
    UPDATE public.accounting_liability_reservations
       SET counts_toward_available = NEW.liability_enforced, updated_at = now()
     WHERE product = NEW.product AND status = 'ACTIVE';
  END IF;
  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS accounting_flag_sync_trg ON public.accounting_migration_flags;
CREATE TRIGGER accounting_flag_sync_trg
  AFTER UPDATE ON public.accounting_migration_flags
  FOR EACH ROW EXECUTE FUNCTION public.accounting_flag_sync();