CREATE OR REPLACE FUNCTION public.accounting_arcade_assert_capacity(p_product text, p_user uuid, p_max_gross numeric, p_stake numeric DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_flags public.accounting_migration_flags; v_env public.acct_environment;
        v_avail numeric(18,2); v_net numeric(18,2);
BEGIN
  SELECT * INTO v_flags FROM public.accounting_migration_flags WHERE product = p_product;
  IF NOT FOUND OR NOT v_flags.journal_enabled THEN RETURN; END IF;
  v_env := public.accounting_user_env(p_user);
  IF v_env IS NULL THEN RETURN; END IF;

  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  v_avail := public.accounting_available_reserve_locked(v_env);
  IF v_net > v_avail THEN
    IF NOT v_flags.capacity_enforced THEN
      INSERT INTO public.operational_alerts(level, category, title, message, status, metadata)
      VALUES ('warning', 'accounting',
              'Arcade placement exceeded available reserve',
              format('%s: net liability %s exceeds available %s (gross %s, stake %s)',
                     p_product, v_net, v_avail, round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2)),
              'open',
              jsonb_build_object('product', p_product, 'net', v_net, 'available', v_avail,
                                 'gross', round(coalesce(p_max_gross,0),2), 'stake', round(coalesce(p_stake,0),2)));
      RETURN;
    END IF;
    RAISE EXCEPTION 'EXPOSURE_LIMIT: max net liability % exceeds available bankroll % (gross %, stake %)',
      v_net, v_avail, round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2);
  END IF;
END;
$function$;