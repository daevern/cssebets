GRANT EXECUTE ON FUNCTION public.accounting_phase8_selftest() TO authenticated, postgres;

-- sandbox_exec is a custom role that only exists on the real hosted project
-- (for an internal sandbox/testing tool). On a fresh/CI database it doesn't
-- exist, so grant to it conditionally instead of failing the migration replay.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_exec') THEN
    GRANT EXECUTE ON FUNCTION public.accounting_phase8_selftest() TO sandbox_exec;
  END IF;
END $$;