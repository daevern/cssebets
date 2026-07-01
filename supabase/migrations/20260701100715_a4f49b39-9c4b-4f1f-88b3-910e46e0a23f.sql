-- ============================================================
-- SPORTSBOOK HARDENING: Phases 2–5
-- ============================================================

-- ============================================================
-- PHASE 2 — Remove direct INSERT on predictions
-- Bets must flow through place_market_bet_atomic (SECURITY DEFINER, service_role gated).
-- ============================================================
DROP POLICY IF EXISTS "Users insert own pending predictions" ON public.predictions;
DROP POLICY IF EXISTS "Users can insert own predictions" ON public.predictions;
DROP POLICY IF EXISTS "Authenticated users can insert predictions" ON public.predictions;
REVOKE INSERT ON public.predictions FROM authenticated;
REVOKE INSERT ON public.predictions FROM anon;
-- service_role retains INSERT for RPC-backed placement; SELECT policy for users is untouched.

-- ============================================================
-- PHASE 3 — Fix cards/corners settlement (v_pred.selection -> selection_label/outcome)
-- ============================================================
CREATE OR REPLACE FUNCTION public.settle_cards_corners_for_match(p_match_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_m record;
  v_pred record;
  v_count int := 0;
  v_total int; v_line int;
  v_won boolean; v_void boolean; v_payout numeric;
  v_home_corners int; v_away_corners int;
  v_home_cards int; v_away_cards int;
  v_selection text;
  v_cards_markets text[] := ARRAY[
    'cards_over_under_2_5','cards_over_under_3_5','cards_over_under_4_5','cards_over_under_5_5',
    'home_cards_over_under_1_5','away_cards_over_under_1_5',
    'red_card_match','first_card'
  ];
  v_corners_markets text[] := ARRAY[
    'corners_over_under_8_5','corners_over_under_9_5','corners_over_under_10_5','corners_over_under_11_5',
    'home_corners_over_under_4_5','away_corners_over_under_4_5',
    'first_corner'
  ];
BEGIN
  SELECT * INTO v_m FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_home_corners := v_m.home_corners;
  v_away_corners := v_m.away_corners;
  v_home_cards   := v_m.home_cards;
  v_away_cards   := v_m.away_cards;

  IF v_home_corners IS NULL THEN
    SELECT corners INTO v_home_corners FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  END IF;
  IF v_away_corners IS NULL THEN
    SELECT corners INTO v_away_corners FROM public.match_stats WHERE match_id=p_match_id AND side='away';
  END IF;
  IF v_home_cards IS NULL THEN
    SELECT COALESCE(yellow_cards,0)+COALESCE(red_cards,0) INTO v_home_cards FROM public.match_stats WHERE match_id=p_match_id AND side='home';
  END IF;
  IF v_away_cards IS NULL THEN
    SELECT COALESCE(yellow_cards,0)+COALESCE(red_cards,0) INTO v_away_cards FROM public.match_stats WHERE match_id=p_match_id AND side='away';
  END IF;

  FOR v_pred IN
    SELECT * FROM public.predictions
    WHERE match_id = p_match_id AND status = 'pending'
      AND (market::text = ANY(v_cards_markets) OR market::text = ANY(v_corners_markets))
    FOR UPDATE
  LOOP
    v_void := false; v_won := false; v_payout := 0;
    -- Normalize selection: prefer selection_label, then outcome. Strip whitespace + uppercase.
    v_selection := UPPER(TRIM(COALESCE(v_pred.selection_label, v_pred.outcome, '')));
    -- Accept a few common human labels ("Over 9.5", "Yes", "No").
    v_selection := REPLACE(v_selection, ' ', '_');
    v_selection := REPLACE(v_selection, '.', '_');

    IF v_pred.market::text = ANY(v_cards_markets) THEN
      IF v_home_cards IS NULL OR v_away_cards IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_home_cards + v_away_cards;
        CASE
          WHEN v_pred.market::text LIKE 'cards_over_under_%' THEN
            v_line := CASE v_pred.market::text
              WHEN 'cards_over_under_2_5' THEN 3
              WHEN 'cards_over_under_3_5' THEN 4
              WHEN 'cards_over_under_4_5' THEN 5
              WHEN 'cards_over_under_5_5' THEN 6 END;
            v_won := (v_selection LIKE 'OVER%' AND v_total >= v_line)
                  OR (v_selection LIKE 'UNDER%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_cards_over_under_1_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_home_cards >= 2)
                  OR (v_selection LIKE 'UNDER%' AND v_home_cards <  2);
          WHEN v_pred.market::text = 'away_cards_over_under_1_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_away_cards >= 2)
                  OR (v_selection LIKE 'UNDER%' AND v_away_cards <  2);
          WHEN v_pred.market::text = 'red_card_match' THEN
            IF v_m.red_card_occurred IS NULL THEN v_void := true;
            ELSE
              v_won := (v_selection IN ('YES','Y','TRUE') AND v_m.red_card_occurred)
                    OR (v_selection IN ('NO','N','FALSE') AND NOT v_m.red_card_occurred);
            END IF;
          WHEN v_pred.market::text = 'first_card' THEN
            IF v_m.first_card_team IS NULL THEN v_void := true;
            ELSE v_won := v_selection = UPPER(v_m.first_card_team);
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_pred.market::text = ANY(v_corners_markets) THEN
      IF v_home_corners IS NULL OR v_away_corners IS NULL THEN
        v_void := true;
      ELSE
        v_total := v_home_corners + v_away_corners;
        CASE
          WHEN v_pred.market::text LIKE 'corners_over_under_%' THEN
            v_line := CASE v_pred.market::text
              WHEN 'corners_over_under_8_5' THEN 9
              WHEN 'corners_over_under_9_5' THEN 10
              WHEN 'corners_over_under_10_5' THEN 11
              WHEN 'corners_over_under_11_5' THEN 12 END;
            v_won := (v_selection LIKE 'OVER%' AND v_total >= v_line)
                  OR (v_selection LIKE 'UNDER%' AND v_total < v_line);
          WHEN v_pred.market::text = 'home_corners_over_under_4_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_home_corners >= 5)
                  OR (v_selection LIKE 'UNDER%' AND v_home_corners <  5);
          WHEN v_pred.market::text = 'away_corners_over_under_4_5' THEN
            v_won := (v_selection LIKE 'OVER%'  AND v_away_corners >= 5)
                  OR (v_selection LIKE 'UNDER%' AND v_away_corners <  5);
          WHEN v_pred.market::text = 'first_corner' THEN
            IF v_m.first_corner_team IS NULL THEN v_void := true;
            ELSE v_won := v_selection = UPPER(v_m.first_corner_team);
            END IF;
        END CASE;
      END IF;
    END IF;

    IF v_void THEN
      UPDATE public.predictions
         SET status='void', points=0, settled_at=now(),
             settled_result='void:'||v_pred.market::text
       WHERE id = v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type, v_pred.virtual_stake,
        'bet_settlement'::public.wallet_ref_type, v_pred.id,
        'Void refund ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      v_count := v_count + 1;
    ELSIF v_won THEN
      v_payout := COALESCE(v_pred.potential_return, v_pred.virtual_stake * v_pred.reference_odds);
      UPDATE public.predictions SET status='won', points=3, settled_at=now(),
        settled_result='won:'||v_pred.market::text WHERE id=v_pred.id;
      PERFORM public.wallet_apply_change(
        v_pred.user_id,'credit'::public.wallet_txn_type,v_payout,
        'bet_settlement'::public.wallet_ref_type,v_pred.id,'Win payout ('||v_pred.market::text||')', COALESCE(v_m.is_simulation,false));
      v_count := v_count + 1;
    ELSE
      UPDATE public.predictions SET status='lost', points=0, settled_at=now(),
        settled_result='lost:'||v_pred.market::text WHERE id=v_pred.id;
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END $function$;

-- ============================================================
-- PHASE 4 — Standardized accounting fields on predictions
-- ============================================================
ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS gross_payout numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS house_profit_loss numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_accounting_version text NOT NULL DEFAULT 'v2';

-- Trigger: populate accounting fields on any status transition INTO a terminal state.
CREATE OR REPLACE FUNCTION public.predictions_accounting_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_stake numeric := COALESCE(NEW.virtual_stake, 0);
  v_odds  numeric := COALESCE(NEW.reference_odds, 1);
  v_potential numeric := COALESCE(NEW.potential_return, v_stake * v_odds);
BEGIN
  -- Only recompute when status just moved to a terminal state.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'won' THEN
      NEW.gross_payout := v_potential;
      NEW.net_profit   := v_potential - v_stake;
      NEW.house_profit_loss := -(v_potential - v_stake);
    ELSIF NEW.status = 'lost' THEN
      NEW.gross_payout := 0;
      NEW.net_profit   := -v_stake;
      NEW.house_profit_loss := v_stake;
    ELSIF NEW.status = 'void' THEN
      NEW.gross_payout := v_stake;
      NEW.net_profit   := 0;
      NEW.house_profit_loss := 0;
    ELSE
      NEW.gross_payout := 0;
      NEW.net_profit   := 0;
      NEW.house_profit_loss := 0;
    END IF;
    NEW.settlement_accounting_version := 'v2';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_predictions_accounting ON public.predictions;
CREATE TRIGGER trg_predictions_accounting
  BEFORE UPDATE ON public.predictions
  FOR EACH ROW
  EXECUTE FUNCTION public.predictions_accounting_trigger();

-- Backfill historical rows only where accounting fields are still zero/default.
UPDATE public.predictions
   SET gross_payout = CASE status
                        WHEN 'won'  THEN COALESCE(potential_return, virtual_stake * reference_odds)
                        WHEN 'void' THEN virtual_stake
                        ELSE 0
                      END,
       net_profit = CASE status
                      WHEN 'won'  THEN COALESCE(potential_return, virtual_stake * reference_odds) - virtual_stake
                      WHEN 'lost' THEN -virtual_stake
                      ELSE 0
                    END,
       house_profit_loss = CASE status
                             WHEN 'won'  THEN -(COALESCE(potential_return, virtual_stake * reference_odds) - virtual_stake)
                             WHEN 'lost' THEN virtual_stake
                             ELSE 0
                           END,
       settlement_accounting_version = 'v2-backfill'
 WHERE status IN ('won','lost','void')
   AND gross_payout = 0
   AND net_profit = 0
   AND house_profit_loss = 0;

-- Backfill potential_return for pending rows that have it missing/zero.
UPDATE public.predictions
   SET potential_return = ROUND(virtual_stake * reference_odds, 2)
 WHERE status = 'pending'
   AND (potential_return IS NULL OR potential_return = 0)
   AND virtual_stake > 0
   AND reference_odds >= 1;

-- ============================================================
-- PHASE 5 — Wallet transaction category typing + honest P&L
-- ============================================================
ALTER TABLE public.wallet_transactions
  ADD COLUMN IF NOT EXISTS transaction_category text,
  ADD COLUMN IF NOT EXISTS bet_id uuid,
  ADD COLUMN IF NOT EXISTS payout_request_id uuid,
  ADD COLUMN IF NOT EXISTS admin_action_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_wallet_txn_category ON public.wallet_transactions(transaction_category);
CREATE INDEX IF NOT EXISTS idx_wallet_txn_bet ON public.wallet_transactions(bet_id) WHERE bet_id IS NOT NULL;

-- Backfill transaction_category from existing (type, reference_type, note) tuples.
UPDATE public.wallet_transactions
   SET transaction_category = CASE
     WHEN reference_type = 'bet_placement' AND type = 'debit' THEN 'bet_stake_debit'
     WHEN reference_type = 'bet_settlement' AND type = 'refund' THEN 'bet_void_refund'
     WHEN reference_type = 'bet_settlement' AND type = 'credit' AND note ILIKE 'void%' THEN 'bet_void_refund'
     WHEN reference_type = 'bet_settlement' AND type = 'credit' THEN 'bet_win_credit'
     WHEN reference_type = 'admin_adjustment' AND type = 'credit' THEN 'admin_adjustment_credit'
     WHEN reference_type = 'admin_adjustment' AND type = 'debit'  THEN 'admin_adjustment_debit'
     WHEN reference_type = 'point_request'   AND type = 'credit' THEN 'deposit_credit'
     WHEN reference_type = 'point_request'   AND type = 'debit'  THEN 'withdrawal_debit'
     WHEN reference_type = 'payout'          AND type = 'debit'  THEN 'payout_completed'
     WHEN reference_type = 'payout'          AND type = 'credit' THEN 'payout_reversed'
     WHEN reference_type = 'house_bankroll'  THEN 'house_bankroll_movement'
     ELSE 'uncategorized'
   END
 WHERE transaction_category IS NULL;

-- Backfill bet_id for settlement/placement rows (reference_id points at the prediction).
UPDATE public.wallet_transactions
   SET bet_id = reference_id
 WHERE bet_id IS NULL
   AND reference_type IN ('bet_placement','bet_settlement')
   AND reference_id IS NOT NULL;

-- Update wallet_apply_change to persist transaction_category on new rows.
CREATE OR REPLACE FUNCTION public.wallet_apply_change(
  p_user_id uuid,
  p_type public.wallet_txn_type,
  p_amount numeric,
  p_reference_type public.wallet_ref_type,
  p_reference_id uuid,
  p_note text DEFAULT NULL::text,
  p_is_simulation boolean DEFAULT false
)
RETURNS TABLE(new_balance numeric, txn_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_before NUMERIC; v_after NUMERIC; v_txn UUID; v_cat text; v_bet uuid;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'wallet: amount must be positive'; END IF;
  INSERT INTO public.wallets(user_id, is_simulation) VALUES (p_user_id, p_is_simulation)
    ON CONFLICT (user_id) DO NOTHING;
  SELECT balance INTO v_before FROM public.wallets WHERE user_id=p_user_id FOR UPDATE;
  IF p_type='debit' THEN
    v_after := v_before - p_amount;
    IF v_after < 0 THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;
  ELSE
    v_after := v_before + p_amount;
  END IF;
  UPDATE public.wallets SET balance=v_after, updated_at=now() WHERE user_id=p_user_id;

  v_cat := CASE
    WHEN p_reference_type = 'bet_placement' AND p_type = 'debit' THEN 'bet_stake_debit'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'refund' THEN 'bet_void_refund'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'credit' AND COALESCE(p_note,'') ILIKE 'void%' THEN 'bet_void_refund'
    WHEN p_reference_type = 'bet_settlement' AND p_type = 'credit' THEN 'bet_win_credit'
    WHEN p_reference_type = 'admin_adjustment' AND p_type = 'credit' THEN 'admin_adjustment_credit'
    WHEN p_reference_type = 'admin_adjustment' AND p_type = 'debit'  THEN 'admin_adjustment_debit'
    WHEN p_reference_type = 'point_request'   AND p_type = 'credit' THEN 'deposit_credit'
    WHEN p_reference_type = 'point_request'   AND p_type = 'debit'  THEN 'withdrawal_debit'
    WHEN p_reference_type = 'payout'          AND p_type = 'debit'  THEN 'payout_completed'
    WHEN p_reference_type = 'payout'          AND p_type = 'credit' THEN 'payout_reversed'
    WHEN p_reference_type = 'house_bankroll'  THEN 'house_bankroll_movement'
    ELSE 'uncategorized'
  END;
  IF p_reference_type IN ('bet_placement','bet_settlement') THEN v_bet := p_reference_id; ELSE v_bet := NULL; END IF;

  INSERT INTO public.wallet_transactions(
    user_id,type,amount,balance_before,balance_after,reference_type,reference_id,note,is_simulation,
    transaction_category, bet_id
  ) VALUES (
    p_user_id,p_type,p_amount,v_before,v_after,p_reference_type,p_reference_id,p_note,p_is_simulation,
    v_cat, v_bet
  ) RETURNING id INTO v_txn;
  new_balance := v_after; txn_id := v_txn; RETURN NEXT;
END $function$;
