CREATE OR REPLACE FUNCTION public.sports_journal_reconciliation(
  p_env public.acct_environment DEFAULT 'PRODUCTION'
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_products text[] := ARRAY['football','f1','ufc'];
  v_stake numeric(18,2);
  v_payout numeric(18,2);
  v_mismatch int;
  v_unbalanced int;
  v_legacy numeric(18,2);
BEGIN
  SELECT coalesce(sum(CASE WHEN j.journal_type = 'STAKE_PLACED' THEN l.credit ELSE 0 END),0)::numeric(18,2),
         coalesce(sum(CASE WHEN j.journal_type = 'PAYOUT_SETTLED' THEN l.debit ELSE 0 END),0)::numeric(18,2)
    INTO v_stake, v_payout
    FROM public.accounting_journals j
    JOIN public.accounting_journal_lines l ON l.journal_id = j.id
    JOIN public.accounting_accounts a ON a.id = l.account_id
   WHERE j.environment = p_env AND j.status = 'POSTED' AND j.product = ANY(v_products)
     AND a.account_code = 'HOUSE_BANKROLL';

  SELECT count(*) INTO v_unbalanced FROM (
    SELECT j.id FROM public.accounting_journals j
      JOIN public.accounting_journal_lines l ON l.journal_id = j.id
     WHERE j.environment = p_env AND j.product = ANY(v_products) AND j.status = 'POSTED'
     GROUP BY j.id HAVING round(sum(l.debit),2) <> round(sum(l.credit),2)) x;

  SELECT count(*) INTO v_mismatch
    FROM public.predictions p
    JOIN public.accounting_journals j
      ON j.reference_id = p.id::text AND j.product = 'football' AND j.environment = p_env
     AND j.status = 'POSTED' AND j.journal_type = 'PAYOUT_SETTLED'
    JOIN LATERAL (SELECT round(sum(l.debit),2) d FROM public.accounting_journal_lines l
                   JOIN public.accounting_accounts a ON a.id = l.account_id
                  WHERE l.journal_id = j.id AND a.account_code = 'HOUSE_BANKROLL') s ON true
   WHERE s.d <> round(CASE WHEN p.status = 'void' THEN p.virtual_stake ELSE p.gross_payout END, 2);

  SELECT balance INTO v_legacy FROM public.platform_bankroll
   WHERE kind = CASE WHEN p_env = 'SIMULATION' THEN 'simulation' ELSE 'live' END
     AND is_active LIMIT 1;

  RETURN jsonb_build_object(
    'environment', p_env,
    'journal_sports_stake_in', v_stake,
    'journal_sports_payout_out', v_payout,
    'journal_sports_net_to_house', round(v_stake - v_payout, 2),
    'legacy_platform_bankroll', v_legacy,
    'unbalanced_journals', v_unbalanced,
    'payout_mismatches', v_mismatch,
    'ok', (v_unbalanced = 0 AND v_mismatch = 0),
    'generated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.sports_journal_reconciliation(public.acct_environment) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sports_journal_reconciliation(public.acct_environment) TO service_role;