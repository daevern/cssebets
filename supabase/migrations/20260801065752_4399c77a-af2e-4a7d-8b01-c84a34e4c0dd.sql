REVOKE ALL ON FUNCTION public.accounting_bankroll_reconciliation(acct_environment) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accounting_bankroll_reconciliation(acct_environment) FROM anon;
REVOKE ALL ON FUNCTION public.accounting_bankroll_reconciliation(acct_environment) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_bankroll_reconciliation(acct_environment) TO service_role;