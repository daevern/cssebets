ALTER FUNCTION public.arcade_bj_is_terminal(bj_hand_status) SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_money_scale() SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_round_money(numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_round_stake(numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_round_payout(numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_round_liability(numeric) SET search_path = public, pg_temp;
ALTER FUNCTION public.acct_money_ok(numeric) SET search_path = public, pg_temp;

ALTER VIEW public.v_accounting_cutover_status SET (security_invoker = true);
ALTER VIEW public.v_accounting_journals SET (security_invoker = true);
ALTER VIEW public.v_accounting_balance_reconstruction SET (security_invoker = true);
ALTER VIEW public.match_market_exposure SET (security_invoker = true);
ALTER VIEW public.v_accounting_migration_readiness SET (security_invoker = true);
ALTER VIEW public.v_accounting_account_activity SET (security_invoker = true);