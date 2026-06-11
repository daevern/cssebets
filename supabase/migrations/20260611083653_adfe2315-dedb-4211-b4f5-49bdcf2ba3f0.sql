CREATE OR REPLACE FUNCTION public.reset_simulation_data(p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE v_deleted jsonb := '{}'::jsonb; v_count int;
BEGIN
  IF NOT private.has_role(p_admin_id, 'admin'::public.app_role)
     AND NOT private.has_role(p_admin_id, 'super_admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  DELETE FROM public.match_pool_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('pool_txns', v_count);

  DELETE FROM public.match_stake_pools WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('pools', v_count);

  DELETE FROM public.platform_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('platform_txns', v_count);

  DELETE FROM public.wallet_transactions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('wallet_txns', v_count);

  DELETE FROM public.predictions WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('predictions', v_count);

  DELETE FROM public.match_odds_snapshots
   WHERE match_id IN (SELECT id FROM public.matches WHERE is_simulation=true);
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('odds_snapshots', v_count);

  DELETE FROM public.matches WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('matches', v_count);

  DELETE FROM public.point_requests WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('point_requests', v_count);

  DELETE FROM public.audit_log WHERE is_simulation=true;
  GET DIAGNOSTICS v_count = ROW_COUNT; v_deleted := v_deleted || jsonb_build_object('audit_log', v_count);

  UPDATE public.platform_bankroll
     SET balance=1000000, total_stakes_collected=0, total_payouts_paid=0, updated_at=now()
   WHERE id=2;

  RETURN v_deleted;
END $function$;