-- 1. Align active Blackjack config: payout ceiling must cover the worst case
UPDATE public.arcade_bj_rule_configs rc
   SET max_payout = greatest(rc.max_payout, public.arcade_bj_worst_case_gross(rc.id, rc.max_stake)),
       updated_at = now()
 WHERE rc.status = 'active';

-- 2. Guard: no config may ship with an unpayable worst case
CREATE OR REPLACE FUNCTION public.arcade_bj_rule_config_exposure_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_worst numeric;
BEGIN
  IF NEW.status IN ('approved','scheduled','active') THEN
    v_worst := greatest(
      NEW.max_stake * greatest(1, coalesce(NEW.max_split_hands,1))
        * (CASE WHEN NEW.double_allowed AND (coalesce(NEW.max_split_hands,1)=1 OR NEW.double_after_split)
                THEN 2 ELSE 1 END) * 2,
      round(NEW.max_stake * (1 + NEW.blackjack_payout), 2));
    IF NEW.max_payout < v_worst THEN
      RAISE EXCEPTION 'RULE_CONFIG_EXPOSURE: max_payout % cannot cover worst-case gross % at max_stake %',
        NEW.max_payout, v_worst, NEW.max_stake;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS bj_rule_config_exposure_guard ON public.arcade_bj_rule_configs;
CREATE TRIGGER bj_rule_config_exposure_guard
  BEFORE INSERT OR UPDATE ON public.arcade_bj_rule_configs
  FOR EACH ROW EXECUTE FUNCTION public.arcade_bj_rule_config_exposure_guard();

-- 3. Fix Treasure Grid test setup (start_round returns a row, not jsonb)
CREATE OR REPLACE FUNCTION public.accounting_phase5_treasure_expiry_test()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  out jsonb := '[]'::jsonb; v_user uuid; v_round uuid; v_mult numeric;
  r public.arcade_treasure_rounds; tr public.arcade_treasure_rounds;
  v_before numeric; v_after numeric;
BEGIN
  SELECT a.user_id INTO v_user FROM public.accounting_accounts a
    JOIN public.accounting_account_balances b ON b.account_id = a.id
   WHERE a.account_code='USER_WALLET' AND a.environment='SIMULATION' AND a.status='ACTIVE'
   ORDER BY b.balance DESC LIMIT 1;

  BEGIN
    SELECT balance INTO v_before FROM public.wallets WHERE user_id=v_user;
    tr := public.arcade_treasure_start_round(v_user,'medium',10,'selftest-seed','p5f-'||gen_random_uuid()::text);
    v_round := tr.id;
    UPDATE public.arcade_treasure_rounds SET safe_reveals=1, status='ACTIVE',
           expires_at = now() - interval '1 minute' WHERE id=v_round;
    SELECT actual_multiplier INTO v_mult FROM public.arcade_treasure_multiplier_tables
     WHERE config_id = tr.config_id AND safe_reveals = 1;
    PERFORM public.arcade_treasure_expire_rounds(50);
    SELECT * INTO r FROM public.arcade_treasure_rounds WHERE id=v_round;
    SELECT balance INTO v_after FROM public.wallets WHERE user_id=v_user;
    out := out || jsonb_build_object('test','treasure:expiry_with_progress_autocollects',
      'pass', r.status='EXPIRED' AND r.result_reason='ROUND_TIMEOUT_AUTOCOLLECT'
              AND r.gross_return = floor(r.stake*v_mult)
              AND (v_after - v_before) = floor(r.stake*v_mult) - r.stake,
      'detail', jsonb_build_object('reason',r.result_reason,'gross',r.gross_return,'stake',r.stake,
                                   'mult',v_mult,'wallet_delta', v_after - v_before));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:expiry_with_progress_autocollects','pass',false,'detail',SQLERRM);
    END IF;
  END;

  BEGIN
    SELECT balance INTO v_before FROM public.wallets WHERE user_id=v_user;
    tr := public.arcade_treasure_start_round(v_user,'medium',10,'selftest-seed','p5f-'||gen_random_uuid()::text);
    v_round := tr.id;
    UPDATE public.arcade_treasure_rounds SET safe_reveals=0, status='ACTIVE',
           expires_at = now() - interval '1 minute' WHERE id=v_round;
    PERFORM public.arcade_treasure_expire_rounds(50);
    SELECT * INTO r FROM public.arcade_treasure_rounds WHERE id=v_round;
    SELECT balance INTO v_after FROM public.wallets WHERE user_id=v_user;
    out := out || jsonb_build_object('test','treasure:expiry_without_progress_refunds_stake',
      'pass', r.status='EXPIRED' AND r.result_reason='ROUND_TIMEOUT'
              AND r.gross_return = r.stake AND r.user_net = 0 AND v_after = v_before,
      'detail', jsonb_build_object('reason',r.result_reason,'gross',r.gross_return,'stake',r.stake,
                                   'wallet_delta', v_after - v_before));
    RAISE EXCEPTION 'ROLLBACK_TEST';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'ROLLBACK_TEST' THEN
      out := out || jsonb_build_object('test','treasure:expiry_without_progress_refunds_stake','pass',false,'detail',SQLERRM);
    END IF;
  END;

  RETURN jsonb_build_object('total', jsonb_array_length(out),
    'passed', (SELECT count(*) FROM jsonb_array_elements(out) e WHERE (e->>'pass')::boolean),
    'results', out);
END; $fn$;
REVOKE ALL ON FUNCTION public.accounting_phase5_treasure_expiry_test() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.accounting_run_phase5_final_selftest()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    INSERT INTO public.accounting_selftest_runs(label, report)
      VALUES ('phase5-final-controls',
        jsonb_build_object('main', public.accounting_phase5_final_selftest(),
                           'treasure', public.accounting_phase5_treasure_expiry_test()));
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.accounting_selftest_runs(label, error) VALUES ('phase5-final-controls', SQLERRM);
  END;
END; $$;