-- Phase 1 regression test: settlement idempotency.
-- Run with: psql -f supabase/tests/settlement_idempotency.sql
-- Self-cleaning: creates and removes only 'test_product' journal rows.

DO $$
DECLARE
  v_ref uuid := gen_random_uuid();
  v_first uuid; v_dup uuid; v_rev uuid; v_second uuid; v_dup2 boolean := false;
BEGIN
  -- 1. First settlement claims version 1.
  v_first := public.settlement_claim('test_product', v_ref, 'settle', 'pending', 'won', NULL, 100);
  IF v_first IS NULL THEN RAISE EXCEPTION 'FAIL: first settle not claimed'; END IF;

  -- 2. Duplicate settlement at the same version must not be claimed.
  v_dup := public.settlement_claim('test_product', v_ref, 'settle', 'pending', 'won', NULL, 100);
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'FAIL: duplicate settle was claimed'; END IF;

  -- 3. Hard DB constraint: a raw duplicate insert must raise unique_violation
  --    so the surrounding money-moving transaction aborts.
  BEGIN
    INSERT INTO public.settlement_journal(product, reference_id, settlement_version, settlement_action, idempotency_key)
    VALUES ('test_product', v_ref, 1, 'settle', 'test_product:' || v_ref::text || ':dupkey');
  EXCEPTION WHEN unique_violation THEN v_dup2 := true;
  END;
  IF NOT v_dup2 THEN RAISE EXCEPTION 'FAIL: UNIQUE(product, reference_id, version, action) did not fire'; END IF;

  -- 4. Audited reversal is allowed.
  v_rev := public.settlement_claim('test_product', v_ref, 'reverse', 'won', 'pending');
  IF v_rev IS NULL THEN RAISE EXCEPTION 'FAIL: reversal not claimed'; END IF;

  -- 5. Regrade after reversal is allowed, at an explicitly new version.
  v_second := public.settlement_claim('test_product', v_ref, 'settle', 'pending', 'lost');
  IF v_second IS NULL THEN RAISE EXCEPTION 'FAIL: post-reversal settle blocked'; END IF;
  IF (SELECT settlement_version FROM public.settlement_journal WHERE id = v_second) <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected settlement_version 2';
  END IF;

  DELETE FROM public.settlement_journal WHERE product = 'test_product';
  RAISE NOTICE 'PASS: settlement idempotency tests';
END $$;
