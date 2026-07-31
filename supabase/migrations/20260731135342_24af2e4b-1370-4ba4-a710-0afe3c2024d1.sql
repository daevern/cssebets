CREATE TABLE IF NOT EXISTS public.accounting_selftest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  report jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.accounting_selftest_runs TO service_role;
GRANT SELECT ON public.accounting_selftest_runs TO supabase_read_only_user;
ALTER TABLE public.accounting_selftest_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.accounting_selftest_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.accounting_run_phase5_final_selftest()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.accounting_selftest_runs(label, report)
      VALUES ('phase5-final-controls', public.accounting_phase5_final_selftest());
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.accounting_selftest_runs(label, error) VALUES ('phase5-final-controls', SQLERRM);
  END;
END; $$;

SELECT cron.schedule('phase5-final-selftest', '* * * * *',
  $$SELECT public.accounting_run_phase5_final_selftest();$$);