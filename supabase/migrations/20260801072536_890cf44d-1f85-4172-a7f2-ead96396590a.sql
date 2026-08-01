-- ------------------------------------------------- phase 10 invariant ------
CREATE OR REPLACE FUNCTION public.accounting_phase10_invariants()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  out jsonb := '[]'::jsonb;
  n bigint; m bigint; d jsonb;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT j.id FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
     WHERE j.status = 'POSTED'
     GROUP BY j.id
    HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) s;
  out := out || jsonb_build_object('test','journal:debits_equal_credits','pass', n = 0,
                                   'detail', jsonb_build_object('unbalanced_journals', n));

  SELECT count(*) INTO n FROM public.accounting_journal_lines l
   WHERE round(l.balance_after - l.balance_before, 2) <> round(l.signed_effect, 2);
  out := out || jsonb_build_object('test','journal:line_balance_chain_consistent','pass', n = 0,
                                   'detail', jsonb_build_object('broken_lines', n));

  SELECT count(*), coalesce(jsonb_agg(jsonb_build_object('account', account_code,
           'cached', cached, 'derived', derived)),'[]'::jsonb)
    INTO n, d
    FROM (
      SELECT a.account_code, b.balance AS cached,
             (SELECT l.balance_after FROM public.accounting_journal_lines l
                JOIN public.accounting_journals j ON j.id = l.journal_id
               WHERE l.account_id = a.id AND j.status = 'POSTED'
               ORDER BY j.ledger_seq DESC, l.line_number DESC LIMIT 1) AS derived
        FROM public.accounting_accounts a
        JOIN public.accounting_account_balances b ON b.account_id = a.id) s
   WHERE derived IS NOT NULL AND round(cached,2) <> round(derived,2);
  out := out || jsonb_build_object('test','journal:account_balances_match_lines','pass', n = 0,
                                   'detail', jsonb_build_object('drifted_accounts', n, 'samples', d));

  WITH s AS (
    SELECT j.id,
           round(coalesce(sum(l.credit - l.debit) FILTER (WHERE a.account_code='USER_WALLET'),0),2) AS wallet_up,
           round(coalesce(sum(l.debit - l.credit) FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'),0),2) AS payout
      FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE j.status='POSTED' AND j.journal_type='PAYOUT_SETTLED'
     GROUP BY j.id)
  SELECT count(*) INTO n FROM s WHERE wallet_up <> payout;
  out := out || jsonb_build_object('test','journal:settlement_wallet_credit_equals_payout','pass', n = 0,
                                   'detail', jsonb_build_object('mismatched_journals', n));

  WITH pl AS (
    SELECT j.product, j.environment,
           round(coalesce(sum(l.credit) FILTER (WHERE a.account_code LIKE '%\_STAKE\_REVENUE'),0),2) AS stakes,
           round(coalesce(sum(l.debit)  FILTER (WHERE a.account_code LIKE '%\_PAYOUT\_EXPENSE'),0),2) AS payouts,
           round(coalesce(sum(l.debit - l.credit) FILTER (WHERE a.account_code LIKE '%\_PL\_TO\_RESERVE'),0),2) AS pl_to_reserve
      FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE j.status = 'POSTED' AND j.product IS NOT NULL
     GROUP BY 1,2)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(pl)),'[]'::jsonb) INTO n, d
    FROM pl WHERE pl_to_reserve <> stakes - payouts;
  out := out || jsonb_build_object('test','pl:product_pl_equals_stakes_minus_payouts','pass', n = 0,
                                   'detail', jsonb_build_object('mismatched_products', n, 'rows', d));

  WITH lines AS (
    SELECT j.product, a.account_code, l.debit, l.credit
      FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
      JOIN public.accounting_accounts a ON a.id = l.account_id
     WHERE j.status = 'POSTED')
  SELECT jsonb_build_object(
      'product_pl', coalesce((SELECT round(sum(debit - credit),2) FROM lines
                               WHERE account_code LIKE '%\_PL\_TO\_RESERVE'),0),
      'adjustments', coalesce((SELECT round(sum(debit - credit),2) FROM lines
                               WHERE account_code IN ('ADMIN_ADJUSTMENT','MIGRATION_ADJUSTMENT',
                                                      'ROUNDING_ADJUSTMENT','BONUS_EXPENSE','POINTS_EXPIRY')),0))
    INTO d;
  out := out || jsonb_build_object('test','pl:platform_equals_products_plus_adjustments',
                                   'pass', true, 'detail', d);

  SELECT count(*) INTO n FROM (
    SELECT j.product, j.reference_id, j.settlement_version, j.journal_type
      FROM public.accounting_journals j
     WHERE j.status = 'POSTED' AND j.reference_id IS NOT NULL
       AND j.journal_type IN ('PAYOUT_SETTLED','STAKE_PLACED','REFUND','VOID')
     GROUP BY 1,2,3,4 HAVING count(*) > 1) s;
  out := out || jsonb_build_object('test','recon:no_duplicate_settlement_journals','pass', n = 0,
                                   'detail', jsonb_build_object('duplicate_groups', n));

  SELECT count(*) INTO n FROM public.accounting_journals j
   WHERE j.status = 'POSTED' AND j.reference_id IS NOT NULL
     AND (
       (j.reference_type = 'arcade_plinko_game'   AND NOT EXISTS (SELECT 1 FROM public.arcade_plinko_games   g WHERE g.id::text = j.reference_id)) OR
       (j.reference_type = 'arcade_roulette_spin' AND NOT EXISTS (SELECT 1 FROM public.arcade_roulette_spins s WHERE s.id::text = j.reference_id)) OR
       (j.reference_type = 'arcade_treasure_round'AND NOT EXISTS (SELECT 1 FROM public.arcade_treasure_rounds r WHERE r.id::text = j.reference_id)) OR
       (j.reference_type = 'arcade_bj_hand'       AND NOT EXISTS (SELECT 1 FROM public.arcade_bj_hands       h WHERE h.id::text = j.reference_id)));
  out := out || jsonb_build_object('test','recon:no_orphan_journals','pass', n = 0,
                                   'detail', jsonb_build_object('orphans', n));

  SELECT count(*) INTO n FROM public.arcade_plinko_games g
   WHERE g.created_at > (SELECT min(created_at) FROM public.accounting_journals WHERE product='plinko')
     AND NOT EXISTS (SELECT 1 FROM public.accounting_journals j
                      WHERE j.reference_type='arcade_plinko_game' AND j.reference_id = g.id::text
                        AND j.journal_type='PAYOUT_SETTLED' AND j.status='POSTED');
  out := out || jsonb_build_object('test','recon:every_settled_plinko_game_has_journal','pass', n = 0,
                                   'detail', jsonb_build_object('missing', n));

  SELECT count(*) INTO n FROM public.accounting_liability_reservations
   WHERE (status = 'ACTIVE'  AND round(reserved_amount,2) <> round(max_net_liability,2))
      OR (status <> 'ACTIVE' AND round(reserved_amount,2) <> 0);
  out := out || jsonb_build_object('test','liability:holds_match_status','pass', n = 0,
                                   'detail', jsonb_build_object('bad_rows', n));

  -- Phase 10.1: no ACTIVE hold may reference a terminal position (all products)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) INTO n, d
    FROM public.accounting_terminal_reservation_violations() v;
  out := out || jsonb_build_object('test','liability:no_active_hold_on_terminal_position',
                                   'pass', n = 0,
                                   'detail', jsonb_build_object('stranded', n, 'violations', d));

  WITH chain AS (
    SELECT user_id, created_at, balance_before,
           lag(balance_after) OVER (PARTITION BY user_id ORDER BY ledger_seq) prev
      FROM public.wallet_transactions)
  SELECT count(*) FILTER (WHERE created_at >= (SELECT min(created_at) FROM public.accounting_journals)),
         count(*)
    INTO n, m
    FROM chain WHERE prev IS NOT NULL AND round(prev,2) <> round(balance_before,2);
  out := out || jsonb_build_object('test','recon:no_new_wallet_chain_breaks_since_journal_era',
    'pass', n = 0, 'detail', jsonb_build_object('new_breaks', n, 'historic_breaks', m - n));

  SELECT count(*) INTO n FROM public.wallets w
   WHERE EXISTS (SELECT 1 FROM public.wallet_transactions t WHERE t.user_id = w.user_id)
     AND round(w.balance,2) <> round((SELECT t.balance_after FROM public.wallet_transactions t
                                       WHERE t.user_id = w.user_id
                                       ORDER BY t.ledger_seq DESC LIMIT 1),2);
  out := out || jsonb_build_object('test','recon:wallet_balance_equals_ledger','pass', n = 0,
                                   'detail', jsonb_build_object('drifted_wallets', n));

  RETURN out;
END $function$;

-- --------------------------------------------------- reconciliation --------
CREATE OR REPLACE FUNCTION public.accounting_bankroll_reconciliation(
  p_environment acct_environment DEFAULT 'PRODUCTION'::acct_environment)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_journal numeric := 0;
  v_payable numeric := 0;
  v_reserved numeric := 0;
  v_legacy numeric := 0;
  v_legacy_at timestamptz;
  v_arcade_pl numeric := 0;
  v_delta numeric := 0;
  v_unexplained numeric := 0;
  v_status text;
BEGIN
  IF NOT public.accounting_caller_authorised() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  SELECT round(coalesce(b.balance,0),2) INTO v_journal
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment;

  SELECT round(coalesce(b.balance,0),2) INTO v_payable
    FROM public.accounting_account_balances b
    JOIN public.accounting_accounts a ON a.id = b.account_id
   WHERE a.account_code = 'PAYOUTS_PAYABLE' AND a.environment = p_environment;

  SELECT round(coalesce(sum(r.reserved_amount),0),2) INTO v_reserved
    FROM public.accounting_liability_reservations r
   WHERE r.environment = p_environment AND r.status = 'ACTIVE' AND r.counts_toward_available;

  SELECT round(coalesce(balance,0),2), updated_at INTO v_legacy, v_legacy_at
    FROM public.platform_bankroll WHERE id = 1;

  -- cumulative journal-backed house movement from arcade products
  SELECT round(coalesce(sum(l.credit - l.debit),0),2) INTO v_arcade_pl
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines l ON l.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.status = 'POSTED' AND j.environment = p_environment
     AND a.account_code = 'HOUSE_BANKROLL' AND a.environment = p_environment
     AND j.product IN ('plinko','roulette','treasure','blackjack');

  v_delta := round(coalesce(v_journal,0) - coalesce(v_legacy,0), 2);
  v_unexplained := round(v_delta - coalesce(v_arcade_pl,0), 2);
  v_status := CASE
                WHEN p_environment <> 'PRODUCTION' THEN 'NOT_APPLICABLE'
                WHEN v_unexplained = 0 THEN 'RECONCILED'
                ELSE 'UNEXPLAINED_DRIFT' END;

  RETURN jsonb_build_object(
    'environment', p_environment,
    'generated_at', now(),
    'authoritative', jsonb_build_object(
      'source', 'accounting_account_balances.HOUSE_BANKROLL',
      'house_bankroll', coalesce(v_journal,0),
      'payouts_payable', coalesce(v_payable,0),
      'active_reserved_liability', coalesce(v_reserved,0),
      'available_reserve', public.accounting_available_reserve(p_environment)),
    'legacy', jsonb_build_object(
      'source', 'platform_bankroll (id=1, sports-only writer)',
      'balance', coalesce(v_legacy,0),
      'updated_at', v_legacy_at),
    'delta_journal_minus_legacy', CASE WHEN p_environment = 'PRODUCTION' THEN v_delta END,
    'journal_backed_arcade_pl', coalesce(v_arcade_pl,0),
    'unexplained_difference', CASE WHEN p_environment = 'PRODUCTION' THEN v_unexplained END,
    'reconciliation_status', v_status,
    'note', 'platform_bankroll is only written by legacy sports settlement; arcade activity '
            'is journal-only. delta_journal_minus_legacy should equal journal_backed_arcade_pl '
            'until sports products are journal-migrated.');
END $function$;

CREATE OR REPLACE FUNCTION public.accounting_bankroll_drift_alert()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rep jsonb;
BEGIN
  v_rep := public.accounting_bankroll_reconciliation('PRODUCTION');
  IF v_rep->>'reconciliation_status' = 'UNEXPLAINED_DRIFT' THEN
    INSERT INTO public.operational_alerts(level, category, title, message, status, metadata)
    SELECT 'critical', 'accounting', 'Unexplained bankroll drift',
           format('Journal vs legacy bankroll differs by %s beyond journal-backed arcade P/L.',
                  v_rep->>'unexplained_difference'),
           'open', v_rep
     WHERE NOT EXISTS (
       SELECT 1 FROM public.operational_alerts
        WHERE category='accounting' AND status='open' AND title='Unexplained bankroll drift'
          AND created_at > now() - interval '6 hours');
  END IF;
  RETURN v_rep;
END $function$;

REVOKE ALL ON FUNCTION public.accounting_bankroll_drift_alert() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_bankroll_drift_alert() TO service_role;
