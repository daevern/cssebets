CREATE OR REPLACE FUNCTION public.arcade_poker_draw(p_user uuid, p_round_id uuid, p_holds int[])
RETURNS public.arcade_mini_rounds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_round public.arcade_mini_rounds;
  v_deck int[];
  v_hand int[];
  v_final int[] := '{}';
  v_holds int[];
  v_next int := 6;
  v_i int;
  v_cat text;
  v_mult numeric(12,4);
  v_top numeric(12,4);
BEGIN
  SELECT * INTO v_round FROM public.arcade_mini_rounds
   WHERE id = p_round_id AND user_id = p_user AND product = 'poker' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ROUND_NOT_FOUND'; END IF;
  IF v_round.status <> 'ACTIVE' THEN RAISE EXCEPTION 'ROUND_ALREADY_SETTLED'; END IF;
  IF v_round.expires_at < now() THEN
    RETURN public.arcade_mini_close(v_round.id, 'VOID', 1, v_round.state, NULL);
  END IF;

  SELECT coalesce(array_agg(DISTINCT x), '{}'::int[]) INTO v_holds
    FROM unnest(coalesce(p_holds, '{}'::int[])) x WHERE x BETWEEN 0 AND 4;

  v_deck := public.arcade_poker_deck(v_round);
  SELECT array_agg(x::int ORDER BY ord) INTO v_hand
    FROM jsonb_array_elements_text(v_round.state->'hand') WITH ORDINALITY t(x, ord);

  FOR v_i IN 1..5 LOOP
    IF (v_i - 1) = ANY (v_holds) THEN
      v_final := v_final || v_hand[v_i];
    ELSE
      v_final := v_final || v_deck[v_next];
      v_next := v_next + 1;
    END IF;
  END LOOP;

  v_cat := public.arcade_poker_eval(v_final);
  v_top := coalesce((v_round.state->>'max_multiplier')::numeric, 250);
  v_mult := least(v_top, coalesce((v_round.state->'paytable'->>v_cat)::numeric, 0));

  RETURN public.arcade_mini_close(
    v_round.id,
    CASE WHEN v_mult > 0 THEN 'WIN' ELSE 'LOSS' END,
    v_mult,
    v_round.state || jsonb_build_object('stage', 'final', 'holds', to_jsonb(v_holds),
      'dealt', v_round.state->'hand', 'final_hand', to_jsonb(v_final),
      'category', v_cat, 'multiplier', v_mult),
    NULL);
END $$;

REVOKE ALL ON FUNCTION public.arcade_poker_draw(uuid, uuid, int[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.arcade_poker_draw(uuid, uuid, int[]) TO service_role;