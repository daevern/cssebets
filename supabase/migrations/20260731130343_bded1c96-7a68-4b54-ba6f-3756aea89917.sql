
CREATE OR REPLACE FUNCTION public.accounting_reverse_plinko_game(p_game_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'ACCOUNTING_FORBIDDEN: only the service role may reverse plinko journals';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'ACCOUNTING_INVALID: a reversal reason is required';
  END IF;

  FOR r IN
    SELECT id, journal_number, event_type FROM public.accounting_journals
     WHERE product = 'plinko' AND reference_id = p_game_id::text AND status = 'POSTED'
       AND event_type IN ('stake','payout')
     ORDER BY ledger_seq DESC
  LOOP
    v_count := v_count + 1;
    v_out := v_out || public.accounting_reverse_journal(
      p_journal_id := r.id,
      p_reason := p_reason,
      p_idempotency_key := 'plinko-reversal:' || p_game_id::text || ':'
        || coalesce(r.event_type, 'leg') || ':v1');
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'ACCOUNTING_NOTHING_TO_REVERSE: no POSTED plinko journals for game %', p_game_id;
  END IF;

  RETURN jsonb_build_object('game_id', p_game_id, 'reversed', v_count, 'reversals', v_out);
END $function$;
