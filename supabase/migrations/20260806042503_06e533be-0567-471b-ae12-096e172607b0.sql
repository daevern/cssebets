-- 1. Env-aware reservation counting -------------------------------------------------
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
    FROM public.accounting_flags_for(p_product, v_env) f;

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
         counts_toward_available = excluded.counts_toward_available,
         updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- 2. One capacity check for every product --------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_assert_capacity(
  p_product text,
  p_user uuid,
  p_max_gross numeric,
  p_stake numeric DEFAULT 0,
  p_is_simulation boolean DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_env public.acct_environment; v_avail numeric(18,2); v_net numeric(18,2);
        v_journal boolean; v_enforced boolean;
BEGIN
  v_env := public.accounting_sports_env(p_user, p_is_simulation);
  IF v_env IS NULL THEN RETURN; END IF;

  SELECT f.journal_enabled, f.capacity_enforced INTO v_journal, v_enforced
    FROM public.accounting_flags_for(p_product, v_env) f;
  IF NOT coalesce(v_journal, false) THEN RETURN; END IF;

  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  IF v_net <= 0 THEN RETURN; END IF;

  v_avail := public.accounting_available_reserve_locked(v_env);
  IF v_net > v_avail THEN
    IF NOT coalesce(v_enforced, true) THEN
      INSERT INTO public.operational_alerts(level, category, title, message, status, metadata)
      VALUES ('warning', 'accounting',
              'Placement exceeded available reserve (shadow)',
              format('%s: net liability %s exceeds available %s (gross %s, stake %s)',
                     p_product, v_net, v_avail, round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2)),
              'open',
              jsonb_build_object('product', p_product, 'environment', v_env, 'net', v_net,
                                 'available', v_avail, 'gross', round(coalesce(p_max_gross,0),2),
                                 'stake', round(coalesce(p_stake,0),2)));
      RETURN;
    END IF;
    RAISE EXCEPTION 'EXPOSURE_LIMIT: max net liability % exceeds available bankroll % (gross %, stake %)',
      v_net, v_avail, round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.accounting_assert_capacity(text, uuid, numeric, numeric, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accounting_assert_capacity(text, uuid, numeric, numeric, boolean) TO service_role;

-- Arcade keeps its existing entry point, now delegating to the shared check.
CREATE OR REPLACE FUNCTION public.accounting_arcade_assert_capacity(
  p_product text, p_user uuid, p_max_gross numeric, p_stake numeric DEFAULT 0)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.accounting_assert_capacity(p_product, p_user, p_max_gross, p_stake, NULL);
END;
$function$;

-- 3. Capacity check at sports placement ----------------------------------------------
CREATE OR REPLACE FUNCTION public.accounting_sports_capacity_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product text := TG_ARGV[0];
  j jsonb := to_jsonb(NEW);
  v_stake numeric; v_gross numeric; v_sim boolean;
BEGIN
  IF upper(coalesce(j->>'status','')) NOT IN ('PENDING','OPEN') THEN RETURN NEW; END IF;
  v_stake := coalesce((j->>'stake')::numeric, (j->>'virtual_stake')::numeric, 0);
  v_gross := coalesce((j->>'potential_payout')::numeric, (j->>'potential_return')::numeric, 0);
  v_sim := CASE WHEN j ? 'is_simulation' THEN coalesce((j->>'is_simulation')::boolean, false) ELSE NULL END;
  PERFORM public.accounting_assert_capacity(v_product, NEW.user_id, v_gross, v_stake, v_sim);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS acct_capacity_predictions ON public.predictions;
CREATE TRIGGER acct_capacity_predictions BEFORE INSERT ON public.predictions
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_capacity_trg('football');

DROP TRIGGER IF EXISTS acct_capacity_ufc ON public.ufc_bets;
CREATE TRIGGER acct_capacity_ufc BEFORE INSERT ON public.ufc_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_capacity_trg('ufc');

DROP TRIGGER IF EXISTS acct_capacity_f1 ON public.f1_bets;
CREATE TRIGGER acct_capacity_f1 BEFORE INSERT ON public.f1_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_capacity_trg('f1');

DROP TRIGGER IF EXISTS acct_capacity_f1_champ ON public.f1_championship_bets;
CREATE TRIGGER acct_capacity_f1_champ BEFORE INSERT ON public.f1_championship_bets
  FOR EACH ROW EXECUTE FUNCTION public.accounting_sports_capacity_trg('f1');

-- 4. Enforce liability in SIMULATION only --------------------------------------------
INSERT INTO public.accounting_migration_flag_envs(product, environment, journal_enabled, liability_enforced, capacity_enforced, notes)
VALUES ('football','SIMULATION', true, true, true, 'Phase B step 2 — simulation liability enforcement'),
       ('f1','SIMULATION',       true, true, true, 'Phase B step 2 — simulation liability enforcement'),
       ('ufc','SIMULATION',      true, true, true, 'Phase B step 2 — simulation liability enforcement')
ON CONFLICT (product, environment) DO UPDATE
  SET journal_enabled = excluded.journal_enabled,
      liability_enforced = excluded.liability_enforced,
      capacity_enforced = excluded.capacity_enforced,
      notes = excluded.notes;

UPDATE public.accounting_liability_reservations
   SET counts_toward_available = true, updated_at = now()
 WHERE environment = 'SIMULATION' AND status = 'ACTIVE'
   AND product IN ('football','f1','ufc') AND counts_toward_available = false;