-- Phase 1 EXTENDED verification suite.
-- Run with: psql -f supabase/tests/phase1_verification.sql
-- Read-only w.r.t. production data: every row it creates uses the synthetic
-- product namespace 'test_%' and is deleted at the end of each block.

\set ON_ERROR_STOP on

-- The whole suite runs inside one transaction and is rolled back at the end,
-- so it never leaves a row behind and never touches production data.
BEGIN;

-- ---------------------------------------------------------------------------
-- T1. TRANSACTION BOUNDARY: claim + money movement are one atomic unit.
--     A forced failure AFTER the claim must roll the claim back, and the
--     retry must then succeed (no poisoned idempotency key).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ref uuid := gen_random_uuid();
  v_after int;
  v_retry uuid;
BEGIN
  BEGIN
    PERFORM public.settlement_claim_then_fail('test_txn', v_ref);
    RAISE EXCEPTION 'FAIL T1: forced failure did not raise';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%FORCED_FAILURE_AFTER_CLAIM%' THEN RAISE; END IF;
  END;

  -- The subtransaction rolled back: the claim must be gone.
  SELECT COUNT(*) INTO v_after FROM public.settlement_journal
   WHERE product = 'test_txn' AND reference_id = v_ref;
  IF v_after <> 0 THEN
    RAISE EXCEPTION 'FAIL T1: claim survived a failed settlement (% rows)', v_after;
  END IF;

  -- Retry after the rollback must succeed at version 1.
  v_retry := public.settlement_claim('test_txn', v_ref, 'settle', 'pending', 'won', NULL, 50);
  IF v_retry IS NULL THEN RAISE EXCEPTION 'FAIL T1: retry after rollback was blocked'; END IF;
  IF (SELECT settlement_version FROM public.settlement_journal WHERE id = v_retry) <> 1 THEN
    RAISE EXCEPTION 'FAIL T1: retry did not reuse version 1';
  END IF;

  RAISE NOTICE 'PASS T1 transaction boundary (claim rolls back, retry succeeds)';
END $$;

-- ---------------------------------------------------------------------------
-- T2. CONTROLLED DUPLICATE RESPONSE: ALREADY_SETTLED instead of a raw
--     unique_violation, carrying the existing settlement result.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_ref uuid := gen_random_uuid();
  a jsonb; b jsonb;
BEGIN
  a := public.settlement_try_claim('test_dup', v_ref, 'settle', 'pending', 'won', NULL, 120.50);
  IF a->>'status' <> 'CLAIMED' THEN RAISE EXCEPTION 'FAIL T2: first claim not CLAIMED (%)', a; END IF;

  b := public.settlement_try_claim('test_dup', v_ref, 'settle', 'pending', 'won', NULL, 120.50,
                                   '{}'::jsonb, (a->>'settlement_version')::int);
  IF b->>'status' <> 'ALREADY_SETTLED' THEN RAISE EXCEPTION 'FAIL T2: duplicate not ALREADY_SETTLED (%)', b; END IF;
  IF (b->>'claim_id') <> (a->>'claim_id') THEN RAISE EXCEPTION 'FAIL T2: idempotent response did not return the existing result'; END IF;
  IF (b->>'gross_payout')::numeric <> 120.50 THEN RAISE EXCEPTION 'FAIL T2: existing payout not echoed back'; END IF;

  RAISE NOTICE 'PASS T2 duplicate settlement returns ALREADY_SETTLED with existing result';
END $$;

-- ---------------------------------------------------------------------------
-- T3. VERSIONING DESIGN: MAX(version)+1 under an advisory lock, reversal
--     attaches to the version it reverses.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ref uuid := gen_random_uuid(); v int;
BEGIN
  PERFORM public.settlement_claim('test_ver', v_ref, 'settle');
  v := public.settlement_next_version('test_ver', v_ref, 'reverse');
  IF v <> 1 THEN RAISE EXCEPTION 'FAIL T3: reversal should target v1, got v%', v; END IF;
  PERFORM public.settlement_claim('test_ver', v_ref, 'reverse');
  v := public.settlement_next_version('test_ver', v_ref, 'settle');
  IF v <> 2 THEN RAISE EXCEPTION 'FAIL T3: next settle should be v2, got v%', v; END IF;

  -- Version allocation must NOT be derived from the reversal count. With zero
  -- reversals recorded, a fresh reference that already has a v1 settle plus a
  -- non-reversal action must still allocate v2 (the old count-based allocator
  -- returned 1 forever whenever reversals were not journalled).
  DECLARE v_ref2 uuid := gen_random_uuid();
  BEGIN
    PERFORM public.settlement_claim('test_ver', v_ref2, 'settle');
    PERFORM public.settlement_claim('test_ver', v_ref2, 'adjust');
    v := public.settlement_next_version('test_ver', v_ref2, 'settle');
    IF v <> 2 THEN RAISE EXCEPTION 'FAIL T3: allocator returned v% with no reversal rows', v; END IF;
  END;


  RAISE NOTICE 'PASS T3 version allocation is monotonic MAX+1 and reversal-paired';
END $$;

-- ---------------------------------------------------------------------------
-- T4. LEGITIMATE REGRADE CYCLE  A -> reverse -> B -> reverse -> A
--     Must succeed. A score is never permanently blacklisted.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ref uuid := gen_random_uuid(); v1 uuid; r1 uuid; v2 uuid; r2 uuid; v3 uuid; n int;
BEGIN
  v1 := public.settlement_claim('test_regrade', v_ref, 'settle', 'pending', 'won',  NULL, 10, '{"score":"A"}');
  r1 := public.settlement_claim('test_regrade', v_ref, 'reverse','won',    'pending');
  v2 := public.settlement_claim('test_regrade', v_ref, 'settle', 'pending','lost',  NULL, 0,  '{"score":"B"}');
  r2 := public.settlement_claim('test_regrade', v_ref, 'reverse','lost',   'pending');
  v3 := public.settlement_claim('test_regrade', v_ref, 'settle', 'pending','won',   NULL, 10, '{"score":"A"}');

  IF v1 IS NULL OR r1 IS NULL OR v2 IS NULL OR r2 IS NULL THEN
    RAISE EXCEPTION 'FAIL T4: regrade chain broke before the final re-settle';
  END IF;
  IF v3 IS NULL THEN
    RAISE EXCEPTION 'FAIL T4: re-settling the ORIGINAL score after two reversals was blocked';
  END IF;
  IF (SELECT settlement_version FROM public.settlement_journal WHERE id=v3) <> 3 THEN
    RAISE EXCEPTION 'FAIL T4: final settle should be v3';
  END IF;

  -- But a duplicate of the SAME version is still refused.
  IF public.settlement_claim('test_regrade', v_ref, 'settle', 'pending','won', NULL, 10, '{}', 3) IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T4: duplicate settlement of v3 was allowed';
  END IF;

  SELECT COUNT(*) INTO n FROM public.settlement_journal WHERE product='test_regrade';
  IF n <> 5 THEN RAISE EXCEPTION 'FAIL T4: expected 5 journal rows, got %', n; END IF;

  RAISE NOTICE 'PASS T4 regrade cycle A -> B -> A succeeds, same-version duplicate refused';
END $$;

-- ---------------------------------------------------------------------------
-- T5. LOSING OUTCOMES ALSO CLAIM. A loss moves no money but must still be
--     journalled, otherwise it could be silently re-settled later.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_ref uuid := gen_random_uuid(); v_loss uuid; v_dup uuid;
BEGIN
  v_loss := public.settlement_claim('test_loss', v_ref, 'settle', 'pending', 'lost', NULL, 0);
  IF v_loss IS NULL THEN RAISE EXCEPTION 'FAIL T5: losing settlement produced no claim'; END IF;
  v_dup := public.settlement_claim('test_loss', v_ref, 'settle', 'pending', 'lost', NULL, 0, '{}', 1);
  IF v_dup IS NOT NULL THEN RAISE EXCEPTION 'FAIL T5: losing settlement is re-claimable'; END IF;
  RAISE NOTICE 'PASS T5 losing outcomes create settlement claims';
END $$;

-- ---------------------------------------------------------------------------
-- T6. COVERAGE: every one of the eight products has a journal guard wired to
--     its source table, covering terminal, open (reversal) and void states.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_missing text;
BEGIN
  SELECT string_agg(p, ', ') INTO v_missing
  FROM unnest(ARRAY['football','ufc','f1','sports_generic','blackjack','plinko','roulette','treasure']) AS p
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE NOT t.tgisinternal
      AND t.tgfoid = 'public.settlement_journal_guard'::regproc
      AND pg_get_triggerdef(t.oid) LIKE '%settlement_journal_guard(''' || p || '''%');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL T6: products without a settlement guard: %', v_missing;
  END IF;
  RAISE NOTICE 'PASS T6 all 8 products have settlement journal guards';
END $$;

ROLLBACK;
\echo 'Phase 1 extended verification: all blocks passed (transaction rolled back)'
