
CREATE TABLE IF NOT EXISTS public.accounting_lock_probe (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  acquired_at timestamptz,
  released_at timestamptz,
  reserve numeric(18,2)
);
GRANT ALL ON public.accounting_lock_probe TO service_role;
GRANT ALL ON SEQUENCE public.accounting_lock_probe_id_seq TO service_role;
ALTER TABLE public.accounting_lock_probe ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.accounting_lock_probe FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.accounting_lock_probe_run(p_label text, p_hold_seconds int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id bigint;
  v_reserve numeric(18,2);
BEGIN
  INSERT INTO public.accounting_lock_probe(label) VALUES (p_label) RETURNING id INTO v_id;
  v_reserve := public.accounting_available_reserve_locked('PRODUCTION');
  UPDATE public.accounting_lock_probe
     SET acquired_at = clock_timestamp(), reserve = v_reserve
   WHERE id = v_id;
  PERFORM pg_sleep(p_hold_seconds);
  UPDATE public.accounting_lock_probe SET released_at = clock_timestamp() WHERE id = v_id;
END $$;

REVOKE ALL ON FUNCTION public.accounting_lock_probe_run(text,int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accounting_lock_probe_run(text,int) TO service_role;
