
-- =====================================================================
-- 1. TIGHTEN PROFILE VISIBILITY
-- =====================================================================
DROP POLICY IF EXISTS "Users view own profile" ON public.profiles;
CREATE POLICY "Users view own profile"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

-- =====================================================================
-- 2. TIGHTEN SUPPORT CONVERSATIONS
-- =====================================================================
DROP POLICY IF EXISTS "user reads own conversation" ON public.support_conversations;
CREATE POLICY "user reads own conversation"
  ON public.support_conversations
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      private.has_role(auth.uid(), 'customer_support'::public.app_role)
      AND (status = 'open' OR claimed_by = auth.uid())
    )
  );

DROP POLICY IF EXISTS "user/staff update conversation" ON public.support_conversations;
CREATE POLICY "user/staff update conversation"
  ON public.support_conversations
  FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR private.has_role(auth.uid(), 'admin'::public.app_role)
    OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      private.has_role(auth.uid(), 'customer_support'::public.app_role)
      AND (status = 'open' OR claimed_by = auth.uid())
    )
  );

-- =====================================================================
-- 3. TIGHTEN SUPPORT MESSAGES (mirror conversation scope)
-- =====================================================================
DROP POLICY IF EXISTS "user reads own messages" ON public.support_messages;
CREATE POLICY "user reads own messages"
  ON public.support_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_conversations c
      WHERE c.id = support_messages.conversation_id
        AND (
          c.user_id = auth.uid()
          OR private.has_role(auth.uid(), 'admin'::public.app_role)
          OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
          OR (
            private.has_role(auth.uid(), 'customer_support'::public.app_role)
            AND (c.status = 'open' OR c.claimed_by = auth.uid())
          )
        )
    )
  );

-- =====================================================================
-- 4. RECONCILIATION HEALTH CHECK
-- =====================================================================
CREATE OR REPLACE FUNCTION public.run_reconciliation_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_checks jsonb := '[]'::jsonb;
  v_drift_count int := 0;

  -- 1. wallet drift
  v_wallet_drift jsonb;
  v_wallet_drift_count int := 0;
  v_worst_wallet_diff numeric := 0;

  -- 2. platform bankroll
  v_pb_real_balance numeric; v_pb_sim_balance numeric;
  v_pb_real_sum numeric; v_pb_sim_sum numeric;
  v_pb_real_diff numeric; v_pb_sim_diff numeric;

  -- 3. match pools
  v_pool_drift jsonb;
  v_pool_drift_count int := 0;

  -- 4. settled payouts
  v_won_total numeric; v_credited_total numeric; v_payout_diff numeric;

  -- 5. point approvals
  v_approved_total numeric; v_point_credit_total numeric; v_pt_diff numeric;

  -- 6. void refunds
  v_void_refund_pred numeric; v_void_refund_wallet numeric; v_void_diff numeric;
BEGIN
  IF NOT (private.has_role(auth.uid(), 'admin'::public.app_role)
       OR private.has_role(auth.uid(), 'super_admin'::public.app_role)
       OR coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  -- ---------- 1. Wallet vs wallet_transactions per user ----------
  WITH per_user AS (
    SELECT
      w.user_id,
      w.balance,
      COALESCE(SUM(CASE wt.type
        WHEN 'credit' THEN wt.amount
        WHEN 'refund' THEN wt.amount
        WHEN 'debit'  THEN -wt.amount
      END), 0) AS expected
    FROM public.wallets w
    LEFT JOIN public.wallet_transactions wt ON wt.user_id = w.user_id
    GROUP BY w.user_id, w.balance
  ),
  drifted AS (
    SELECT user_id, balance, expected, ROUND(balance - expected, 2) AS diff
    FROM per_user
    WHERE ROUND(balance - expected, 2) <> 0
  )
  SELECT
    COUNT(*),
    COALESCE(MAX(ABS(diff)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'user_id', user_id, 'wallet_balance', balance,
      'expected', expected, 'diff', diff
    ) ORDER BY ABS(diff) DESC), '[]'::jsonb)
  INTO v_wallet_drift_count, v_worst_wallet_diff, v_wallet_drift
  FROM drifted;

  v_checks := v_checks || jsonb_build_object(
    'name', 'wallet_vs_transactions',
    'status', CASE WHEN v_wallet_drift_count = 0 THEN 'OK' ELSE 'DRIFT' END,
    'affected', v_wallet_drift_count,
    'worst_diff', v_worst_wallet_diff,
    'samples', (SELECT jsonb_path_query_array(v_wallet_drift, '$[0 to 9]'))
  );
  IF v_wallet_drift_count > 0 THEN v_drift_count := v_drift_count + 1; END IF;

  -- ---------- 2. Platform bankroll vs platform_transactions ----------
  SELECT balance INTO v_pb_real_balance FROM public.platform_bankroll WHERE id = 1;
  SELECT balance INTO v_pb_sim_balance  FROM public.platform_bankroll WHERE id = 2;

  SELECT
    COALESCE(SUM(CASE transaction_type
      WHEN 'stake_collected'      THEN amount
      WHEN 'match_pool_collected' THEN amount
      WHEN 'admin_topup'          THEN amount
      WHEN 'payout_paid'          THEN -amount
      WHEN 'void_refund'          THEN -amount
    END), 0)
  INTO v_pb_real_sum FROM public.platform_transactions WHERE is_simulation = false;

  SELECT
    COALESCE(SUM(CASE transaction_type
      WHEN 'stake_collected'      THEN amount
      WHEN 'match_pool_collected' THEN amount
      WHEN 'admin_topup'          THEN amount
      WHEN 'payout_paid'          THEN -amount
      WHEN 'void_refund'          THEN -amount
    END), 0)
  INTO v_pb_sim_sum FROM public.platform_transactions WHERE is_simulation = true;

  v_pb_real_diff := ROUND(v_pb_real_balance - v_pb_real_sum, 2);
  v_pb_sim_diff  := ROUND(v_pb_sim_balance  - v_pb_sim_sum, 2);

  v_checks := v_checks || jsonb_build_object(
    'name', 'platform_bankroll_vs_transactions',
    'status', CASE WHEN v_pb_real_diff = 0 AND v_pb_sim_diff = 0 THEN 'OK' ELSE 'DRIFT' END,
    'real', jsonb_build_object('balance', v_pb_real_balance, 'expected', v_pb_real_sum, 'diff', v_pb_real_diff),
    'simulation', jsonb_build_object('balance', v_pb_sim_balance, 'expected', v_pb_sim_sum, 'diff', v_pb_sim_diff)
  );
  IF v_pb_real_diff <> 0 OR v_pb_sim_diff <> 0 THEN v_drift_count := v_drift_count + 1; END IF;

  -- ---------- 3. Match stake pools vs match_pool_transactions ----------
  WITH per_match AS (
    SELECT
      p.match_id,
      p.total_pool,
      COALESCE(SUM(CASE pt.transaction_type
        WHEN 'stake_held'                   THEN pt.amount
        WHEN 'pool_transferred_to_bankroll' THEN -pt.amount
        WHEN 'void_refund_from_pool'        THEN -pt.amount
      END), 0) AS expected
    FROM public.match_stake_pools p
    LEFT JOIN public.match_pool_transactions pt ON pt.match_id = p.match_id
    GROUP BY p.match_id, p.total_pool
  ),
  drifted AS (
    SELECT match_id, total_pool, expected, ROUND(total_pool - expected, 2) AS diff
    FROM per_match
    WHERE ROUND(total_pool - expected, 2) <> 0
  )
  SELECT
    COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'match_id', match_id, 'pool', total_pool, 'expected', expected, 'diff', diff
    ) ORDER BY ABS(diff) DESC), '[]'::jsonb)
  INTO v_pool_drift_count, v_pool_drift
  FROM drifted;

  v_checks := v_checks || jsonb_build_object(
    'name', 'match_pools_vs_transactions',
    'status', CASE WHEN v_pool_drift_count = 0 THEN 'OK' ELSE 'DRIFT' END,
    'affected', v_pool_drift_count,
    'samples', (SELECT jsonb_path_query_array(v_pool_drift, '$[0 to 9]'))
  );
  IF v_pool_drift_count > 0 THEN v_drift_count := v_drift_count + 1; END IF;

  -- ---------- 4. Settled payouts: wins -> wallet credit (real bets) ----------
  SELECT COALESCE(SUM(potential_return), 0) INTO v_won_total
  FROM public.predictions
  WHERE status = 'won' AND COALESCE(is_simulation, false) = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_credited_total
  FROM public.wallet_transactions
  WHERE reference_type = 'bet_settlement' AND type = 'credit'
    AND COALESCE(is_simulation, false) = false;

  v_payout_diff := ROUND(v_credited_total - v_won_total, 2);
  v_checks := v_checks || jsonb_build_object(
    'name', 'settled_payouts_vs_wallet_credits',
    'status', CASE WHEN v_payout_diff = 0 THEN 'OK' ELSE 'DRIFT' END,
    'won_total', v_won_total,
    'credited_total', v_credited_total,
    'diff', v_payout_diff
  );
  IF v_payout_diff <> 0 THEN v_drift_count := v_drift_count + 1; END IF;

  -- ---------- 5. Point request approvals -> wallet credit ----------
  SELECT COALESCE(SUM(requested_amount), 0) INTO v_approved_total
  FROM public.point_requests WHERE status = 'approved';

  SELECT COALESCE(SUM(amount), 0) INTO v_point_credit_total
  FROM public.wallet_transactions
  WHERE reference_type = 'point_request' AND type = 'credit';

  v_pt_diff := ROUND(v_point_credit_total - v_approved_total, 2);
  v_checks := v_checks || jsonb_build_object(
    'name', 'point_approvals_vs_wallet_credits',
    'status', CASE WHEN v_pt_diff = 0 THEN 'OK' ELSE 'DRIFT' END,
    'approved_total', v_approved_total,
    'credited_total', v_point_credit_total,
    'diff', v_pt_diff
  );
  IF v_pt_diff <> 0 THEN v_drift_count := v_drift_count + 1; END IF;

  -- ---------- 6. Void refunds: predictions(void) stake -> wallet refunds ----------
  SELECT COALESCE(SUM(virtual_stake), 0) INTO v_void_refund_pred
  FROM public.predictions
  WHERE status = 'void' AND COALESCE(is_simulation, false) = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_void_refund_wallet
  FROM public.wallet_transactions
  WHERE reference_type = 'bet_settlement' AND type = 'refund'
    AND COALESCE(is_simulation, false) = false;

  v_void_diff := ROUND(v_void_refund_wallet - v_void_refund_pred, 2);
  v_checks := v_checks || jsonb_build_object(
    'name', 'void_refunds_vs_wallet_refunds',
    'status', CASE WHEN v_void_diff = 0 THEN 'OK' ELSE 'DRIFT' END,
    'void_stake_total', v_void_refund_pred,
    'refund_total', v_void_refund_wallet,
    'diff', v_void_diff,
    'note', 'Refunds include partial-stake decreases on pending bets, so a positive diff is expected.'
  );
  -- Note: This is informational; flag only when refund_total < void_stake (under-refunded).
  IF v_void_diff < 0 THEN v_drift_count := v_drift_count + 1; END IF;

  RETURN jsonb_build_object(
    'checked_at', now(),
    'overall_status', CASE WHEN v_drift_count = 0 THEN 'OK' ELSE 'DRIFT' END,
    'drift_check_count', v_drift_count,
    'checks', v_checks
  );
END $$;

REVOKE ALL ON FUNCTION public.run_reconciliation_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.run_reconciliation_check() TO authenticated, service_role;
