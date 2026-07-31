CREATE OR REPLACE FUNCTION public.accounting_liability_test_cleanup(p_ref_type text, p_round uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF p_ref_type IS NULL OR left(p_ref_type, 3) <> 'p6_' THEN
    RAISE EXCEPTION 'cleanup helper only accepts p6_* test reference types';
  END IF;
  DELETE FROM public.accounting_liability_reservations WHERE reference_type = p_ref_type;
  IF p_round IS NOT NULL THEN
    UPDATE public.arcade_treasure_rounds SET status = 'VOID'
     WHERE id = p_round AND status NOT IN ('VOID','WON','LOST','PUSH','EXPIRED','REVERSED');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.accounting_liability_test_cleanup(text, uuid) FROM PUBLIC, anon, authenticated;