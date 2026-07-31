CREATE OR REPLACE FUNCTION public.settlement_next_version(
  p_product text, p_reference_id uuid, p_action text
) RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_max_settle int;
BEGIN
  -- Serialise version allocation for this (product, reference) for the rest of
  -- the transaction. Two concurrent settlers can no longer read the same MAX.
  PERFORM pg_advisory_xact_lock(hashtext(p_product), hashtext(p_reference_id::text));

  SELECT COALESCE(MAX(settlement_version), 0) INTO v_max_settle
  FROM public.settlement_journal
  WHERE product = p_product AND reference_id = p_reference_id
    AND settlement_action IN ('settle','resettle','regrade');

  -- Reversals and adjustments attach to the settlement version they relate to.
  IF p_action IN ('reverse','adjust') THEN
    RETURN GREATEST(v_max_settle, 1);
  END IF;

  RETURN v_max_settle + 1;
END $$;