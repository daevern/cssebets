REVOKE EXECUTE ON FUNCTION public.run_reconciliation_check() FROM authenticated;
-- Keep service_role grant; admin server-fn calls it via supabaseAdmin.
GRANT EXECUTE ON FUNCTION public.run_reconciliation_check() TO service_role;