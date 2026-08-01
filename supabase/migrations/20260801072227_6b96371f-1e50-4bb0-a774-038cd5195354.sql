-- ---------------------------------------------------------------- state ----
CREATE OR REPLACE FUNCTION public.accounting_position_state(
  p_reference_type text,
  p_reference_id uuid)
RETURNS TABLE(product text, status text, outcome text, is_terminal boolean, settled_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'plinko', g.outcome::text,
         CASE g.outcome::text WHEN 'WIN' THEN 'WIN' WHEN 'LOSS' THEN 'LOSS'
                              WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED' END,
         g.outcome::text IN ('WIN','LOSS','VOID','REVERSED'),
         g.completed_at
    FROM public.arcade_plinko_games g
   WHERE p_reference_type = 'arcade_plinko_game' AND g.id = p_reference_id
  UNION ALL
  SELECT 'roulette', s.status::text,
         CASE s.status::text WHEN 'WIN' THEN 'WIN' WHEN 'LOSS' THEN 'LOSS' WHEN 'PUSH' THEN 'PUSH'
                             WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED' END,
         s.status::text IN ('WIN','LOSS','PUSH','VOID','REVERSED'),
         s.completed_at
    FROM public.arcade_roulette_spins s
   WHERE p_reference_type = 'arcade_roulette_spin' AND s.id = p_reference_id
  UNION ALL
  SELECT 'treasure', t.status::text,
         CASE t.status::text WHEN 'WON' THEN 'WIN' WHEN 'LOST' THEN 'LOSS' WHEN 'PUSH' THEN 'PUSH'
                             WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED'
                             WHEN 'EXPIRED' THEN 'CANCELLED' END,
         t.status::text IN ('WON','LOST','PUSH','VOID','REVERSED','EXPIRED'),
         t.settled_at
    FROM public.arcade_treasure_rounds t
   WHERE p_reference_type = 'arcade_treasure_round' AND t.id = p_reference_id
  UNION ALL
  SELECT 'blackjack', h.status::text,
         CASE
           WHEN h.status::text = 'VOID'     THEN 'VOID'
           WHEN h.status::text = 'REVERSED' THEN 'REVERSED'
           WHEN h.status::text = 'EXPIRED'  THEN 'CANCELLED'
           WHEN h.status::text = 'COMPLETED' THEN
             CASE h.result::text
               WHEN 'BLACKJACK' THEN 'WIN' WHEN 'WIN' THEN 'WIN'
               WHEN 'LOSS' THEN 'LOSS' WHEN 'BUST' THEN 'LOSS'
               WHEN 'PUSH' THEN 'PUSH' WHEN 'VOID' THEN 'VOID' WHEN 'REVERSED' THEN 'REVERSED'
               WHEN 'MIXED' THEN CASE WHEN coalesce(h.total_payout,0) > coalesce(h.total_stake,0) THEN 'WIN'
                                      WHEN coalesce(h.total_payout,0) = coalesce(h.total_stake,0) THEN 'PUSH'
                                      ELSE 'LOSS' END
             END
         END,
         h.status::text IN ('COMPLETED','VOID','REVERSED','EXPIRED'),
         h.settled_at
    FROM public.arcade_bj_hands h
   WHERE p_reference_type = 'arcade_bj_hand' AND h.id = p_reference_id;
$$;

REVOKE ALL ON FUNCTION public.accounting_position_state(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_position_state(text, uuid) TO service_role;

-- ------------------------------------------------------------ invariant ----
CREATE OR REPLACE FUNCTION public.accounting_terminal_reservation_violations()
RETURNS TABLE(
  product text, reference_type text, reference_id uuid, position_status text,
  position_outcome text, reservation_id uuid, reserved_amount numeric,
  reserved_at timestamptz, settled_at timestamptz, environment text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(ps.product, r.product), r.reference_type, r.reference_id,
         ps.status, ps.outcome, r.id, r.reserved_amount,
         coalesce(r.reserved_at, r.created_at), ps.settled_at, r.environment::text
    FROM public.accounting_liability_reservations r
    JOIN public.accounting_migration_flags f ON f.product = r.product AND f.journal_enabled
    CROSS JOIN LATERAL public.accounting_position_state(r.reference_type, r.reference_id) ps
   WHERE r.status = 'ACTIVE' AND ps.is_terminal;
$$;

REVOKE ALL ON FUNCTION public.accounting_terminal_reservation_violations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_terminal_reservation_violations() TO service_role;

-- --------------------------------------------------------------- repair ----
CREATE OR REPLACE FUNCTION public.accounting_repair_terminal_reservation(
  p_reference_type text,
  p_reference_id uuid,
  p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_res public.accounting_liability_reservations;
  v_prev text;
  v_state record;
  v_corr uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_before numeric; v_after numeric;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF coalesce(length(btrim(p_reason)), 0) < 8 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: supply an explanatory repair reason';
  END IF;

  SELECT * INTO v_res
    FROM public.accounting_liability_reservations
   WHERE reference_type = p_reference_type AND reference_id = p_reference_id
   ORDER BY (status = 'ACTIVE') DESC, version DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RESERVATION_NOT_FOUND: % %', p_reference_type, p_reference_id;
  END IF;

  -- serialise against concurrent placements in this environment
  PERFORM public.accounting_available_reserve_locked(v_res.environment);
  v_before := public.accounting_available_reserve(v_res.environment);

  IF v_res.status <> 'ACTIVE' THEN
    RETURN jsonb_build_object(
      'repaired', false, 'idempotent_noop', true,
      'reservation_id', v_res.id, 'status', v_res.status,
      'reason', 'ALREADY_RELEASED',
      'available_reserve_before', v_before, 'available_reserve_after', v_before);
  END IF;

  SELECT * INTO v_state
    FROM public.accounting_position_state(p_reference_type, p_reference_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'POSITION_NOT_FOUND: % %', p_reference_type, p_reference_id;
  END IF;
  IF NOT v_state.is_terminal THEN
    RAISE EXCEPTION 'POSITION_STILL_ACTIVE: % is in state % — reservation is legitimate',
      p_reference_id, v_state.status;
  END IF;

  v_prev := v_res.status;
  PERFORM public.accounting_release_liability(
    p_reference_type, p_reference_id,
    'REPAIR_TERMINAL_' || v_state.status);

  SELECT * INTO v_res FROM public.accounting_liability_reservations WHERE id = v_res.id;
  v_after := public.accounting_available_reserve(v_res.environment);

  INSERT INTO public.audit_log(user_id, action, entity, entity_id, reason, metadata, new_value, old_value)
  VALUES (v_actor, 'accounting.repair_terminal_reservation',
          'accounting_liability_reservations', v_res.id, btrim(p_reason),
          jsonb_build_object(
            'correlation_id', v_corr,
            'reference_type', p_reference_type,
            'reference_id', p_reference_id,
            'product', v_state.product,
            'position_status', v_state.status,
            'position_outcome', v_state.outcome,
            'environment', v_res.environment,
            'available_reserve_before', v_before,
            'available_reserve_after', v_after,
            'repaired_at', now()),
          jsonb_build_object('status', v_res.status, 'reserved_amount', v_res.reserved_amount),
          jsonb_build_object('status', v_prev, 'reserved_amount', v_res.initial_reserved_amount));

  UPDATE public.operational_alerts
     SET status = 'resolved', resolved_at = now(), resolved_by = v_actor
   WHERE category = 'accounting'
     AND status <> 'resolved'
     AND metadata->>'reference_id' = p_reference_id::text;

  INSERT INTO public.operational_alerts(level, category, title, message, status, metadata)
  VALUES ('info', 'accounting', 'Stranded liability reservation repaired',
          format('%s reservation on %s (%s) released by audited repair.',
                 v_state.product, p_reference_id, v_state.status),
          'resolved',
          jsonb_build_object('correlation_id', v_corr, 'reference_type', p_reference_type,
                             'reference_id', p_reference_id, 'reason', btrim(p_reason),
                             'previous_status', v_prev, 'new_status', v_res.status));

  RETURN jsonb_build_object(
    'repaired', true, 'idempotent_noop', false,
    'correlation_id', v_corr,
    'reservation_id', v_res.id,
    'reference_type', p_reference_type, 'reference_id', p_reference_id,
    'product', v_state.product,
    'position_status', v_state.status, 'position_outcome', v_state.outcome,
    'previous_status', v_prev, 'new_status', v_res.status,
    'preserved_amount', v_res.initial_reserved_amount,
    'available_reserve_before', v_before, 'available_reserve_after', v_after);
END;
$$;

REVOKE ALL ON FUNCTION public.accounting_repair_terminal_reservation(text, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_repair_terminal_reservation(text, uuid, text) TO service_role;

-- ---------------------------------------------------------------- alert ----
CREATE OR REPLACE FUNCTION public.accounting_liability_integrity_alert()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_rows jsonb; v_n int;
BEGIN
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) INTO v_n, v_rows
    FROM public.accounting_terminal_reservation_violations() v;

  IF v_n > 0 THEN
    INSERT INTO public.operational_alerts(level, category, title, message, status, metadata)
    SELECT 'critical', 'accounting', 'Stranded liability reservation',
           format('%s active liability reservation(s) reference a terminal position.', v_n),
           'open', jsonb_build_object('violations', v_rows, 'count', v_n)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.operational_alerts
        WHERE category = 'accounting' AND status = 'open'
          AND title = 'Stranded liability reservation'
          AND created_at > now() - interval '6 hours');
  END IF;

  RETURN jsonb_build_object('checked_at', now(), 'violations', v_n, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.accounting_liability_integrity_alert() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_liability_integrity_alert() TO service_role;
