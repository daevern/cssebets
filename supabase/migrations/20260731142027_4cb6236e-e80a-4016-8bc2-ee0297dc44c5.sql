CREATE OR REPLACE FUNCTION public.accounting_reserve_liability(
  p_product text, p_game text, p_reference_type text, p_reference_id uuid, p_user uuid,
  p_max_gross numeric, p_stake numeric, p_config_version text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb, p_settled boolean DEFAULT false)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_env public.acct_environment;
  v_net numeric(18,2);
  v_counts boolean;
  v_id uuid;
BEGIN
  v_env := coalesce(public.accounting_user_env(p_user), 'PRODUCTION');
  v_net := greatest(round(coalesce(p_max_gross,0),2) - round(coalesce(p_stake,0),2), 0);
  SELECT coalesce(f.liability_enforced,false) INTO v_counts
    FROM public.accounting_migration_flags f WHERE f.product = p_product;

  INSERT INTO public.accounting_liability_reservations(
    environment, product, game, reference_type, reference_id, user_id,
    max_gross_payout, stake_collected, max_net_liability, reserved_amount,
    counts_toward_available, status, release_reason, released_at,
    config_version, metadata)
  VALUES (v_env, p_product, coalesce(p_game, p_product), p_reference_type, p_reference_id, p_user,
    round(coalesce(p_max_gross,0),2), round(coalesce(p_stake,0),2), v_net,
    CASE WHEN p_settled THEN 0 ELSE v_net END,
    coalesce(v_counts,false),
    CASE WHEN p_settled THEN 'RELEASED' ELSE 'ACTIVE' END,
    CASE WHEN p_settled THEN 'SETTLED_SAME_TRANSACTION' END,
    CASE WHEN p_settled THEN now() END,
    p_config_version, coalesce(p_metadata,'{}'::jsonb))
  ON CONFLICT (reference_type, reference_id) DO UPDATE
     SET max_gross_payout = excluded.max_gross_payout,
         stake_collected  = excluded.stake_collected,
         max_net_liability = excluded.max_net_liability,
         reserved_amount = CASE WHEN public.accounting_liability_reservations.status = 'ACTIVE'
                                THEN excluded.reserved_amount
                                ELSE 0 END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

UPDATE public.accounting_liability_reservations
   SET reserved_amount = 0,
       released_at = coalesce(released_at, now()),
       release_reason = coalesce(release_reason, 'BACKFILL_ZERO_ON_RELEASED')
 WHERE status <> 'ACTIVE' AND reserved_amount <> 0;