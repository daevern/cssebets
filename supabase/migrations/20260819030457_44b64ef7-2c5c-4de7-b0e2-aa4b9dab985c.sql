DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'arcade_rps_rounds'
    AND column_name <> 'server_seed';

  EXECUTE 'REVOKE SELECT ON public.arcade_rps_rounds FROM authenticated';
  EXECUTE 'REVOKE SELECT ON public.arcade_rps_rounds FROM anon';
  EXECUTE format('GRANT SELECT (%s) ON public.arcade_rps_rounds TO authenticated', cols);
END $$;

GRANT ALL ON public.arcade_rps_rounds TO service_role;