CREATE OR REPLACE FUNCTION public.accounting_phase101_selftest()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb;
  n bigint; d jsonb; v jsonb; src text; ok boolean;
BEGIN
  -- 1. no stranded holds
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO n, d
    FROM public.accounting_terminal_reservation_violations() x;
  out := out || jsonb_build_object('test','no_active_hold_on_terminal_position','pass', n = 0,
                                   'detail', jsonb_build_object('stranded', n, 'rows', d));

  -- 2. repair rejects an unknown reference
  BEGIN
    PERFORM public.accounting_repair_terminal_reservation(
      'arcade_bj_hand', '00000000-0000-0000-0000-000000000000',
      'phase 10.1 regression probe');
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE 'RESERVATION_NOT_FOUND%' OR SQLERRM LIKE 'FORBIDDEN%';
  END;
  out := out || jsonb_build_object('test','repair_rejects_unknown_reference','pass', ok);

  -- 3. repair rejects a missing/short reason
  BEGIN
    PERFORM public.accounting_repair_terminal_reservation(
      'arcade_bj_hand', '00000000-0000-0000-0000-000000000000', 'x');
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := SQLERRM LIKE 'REASON_REQUIRED%' OR SQLERRM LIKE 'FORBIDDEN%';
  END;
  out := out || jsonb_build_object('test','repair_requires_reason','pass', ok);

  -- 4. repair source refuses non-terminal positions and is idempotent
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'accounting_repair_terminal_reservation' AND pronamespace = 'public'::regnamespace;
  out := out || jsonb_build_object('test','repair_guards_present',
    'pass', src LIKE '%POSITION_STILL_ACTIVE%'
        AND src LIKE '%idempotent_noop%'
        AND src LIKE '%accounting_available_reserve_locked%'
        AND src LIKE '%audit_log%');

  -- 5. no-payout recognition is outcome-driven, not release-driven
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'accounting_pl_report' AND pronamespace = 'public'::regnamespace;
  out := out || jsonb_build_object('test','pl_zero_payout_requires_loss_outcome',
    'pass', src LIKE '%pos_outcome = ''LOSS''%'
        AND src LIKE '%unclassified_release%'
        AND src LIKE '%active_hold%');

  -- 6. bankroll reconciles with no unexplained difference
  v := public.accounting_bankroll_reconciliation('PRODUCTION');
  out := out || jsonb_build_object('test','bankroll_reconciles',
    'pass', v->>'reconciliation_status' = 'RECONCILED',
    'detail', jsonb_build_object(
      'unexplained_difference', v->'unexplained_difference',
      'delta', v->'delta_journal_minus_legacy',
      'journal_backed_arcade_pl', v->'journal_backed_arcade_pl'));

  -- 7. no unclassified settled positions in the live P/L window
  SELECT coalesce(sum((p->>'unclassified_positions')::bigint),0) INTO n
    FROM jsonb_array_elements(
           (public.accounting_pl_report('PRODUCTION', now() - interval '400 days', now(),
                                        'settlement', NULL, NULL, NULL, NULL, NULL))->'groups') g,
         jsonb_array_elements(g->'products') p;
  out := out || jsonb_build_object('test','pl_no_unclassified_positions','pass', n = 0,
                                   'detail', jsonb_build_object('unclassified', n));

  -- 8. expiry sweep leaves no stale open hands
  SELECT count(*) INTO n FROM public.arcade_bj_hands
   WHERE status NOT IN ('COMPLETED','VOID','REVERSED','EXPIRED')
     AND expires_at < now() - interval '10 minutes';
  out := out || jsonb_build_object('test','no_stale_open_blackjack_hands','pass', n = 0,
                                   'detail', jsonb_build_object('stale_hands', n));

  RETURN jsonb_build_object(
    'suite', 'phase_10_1_bankroll_authority_and_reservation_integrity',
    'ran_at', now(),
    'passed', (SELECT count(*) FROM jsonb_array_elements(out) e WHERE (e->>'pass')::boolean),
    'total', jsonb_array_length(out),
    'results', out);
END $function$;

REVOKE ALL ON FUNCTION public.accounting_phase101_selftest() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_phase101_selftest() TO service_role;
