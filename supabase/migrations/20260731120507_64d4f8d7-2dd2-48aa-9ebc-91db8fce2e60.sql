ALTER FUNCTION public.accounting_internal_ctx() SET search_path = public;
ALTER FUNCTION public.accounting_journal_immutable() SET search_path = public;
ALTER FUNCTION public.accounting_line_immutable() SET search_path = public;
ALTER FUNCTION public.accounting_balance_guard() SET search_path = public;
ALTER FUNCTION public.accounting_cutover_guard() SET search_path = public;

REVOKE ALL ON FUNCTION public.accounting_caller_authorised() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_internal_ctx() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_account_balance_seed() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_journal_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_line_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_balance_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.accounting_cutover_guard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_caller_authorised() TO service_role;
GRANT EXECUTE ON FUNCTION public.accounting_internal_ctx() TO service_role;