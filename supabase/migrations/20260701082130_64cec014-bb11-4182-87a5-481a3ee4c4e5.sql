-- Auto-derive qualifier from decisive 90-min score in the all-markets settler.
-- If qualifier is not passed and the match is not drawn, infer from scores and
-- persist to matches.qualifier so future reconciliation sees a consistent state.
CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(
  p_match_id uuid,
  p_home integer,
  p_away integer,
  p_home_ht integer DEFAULT NULL::integer,
  p_away_ht integer DEFAULT NULL::integer,
  p_qualifier text DEFAULT NULL::text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count int := 0;
  v_qualifier text := p_qualifier;
  v_existing text;
BEGIN
  v_count := v_count + public.settle_match_atomic(p_match_id, p_home, p_away);
  v_count := v_count + public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht);

  -- Resolve qualifier: caller value > existing matches.qualifier > derived from decisive score.
  IF v_qualifier IS NULL THEN
    SELECT qualifier INTO v_existing FROM public.matches WHERE id = p_match_id;
    v_qualifier := v_existing;
  END IF;
  IF v_qualifier IS NULL AND p_home IS NOT NULL AND p_away IS NOT NULL AND p_home <> p_away THEN
    v_qualifier := CASE WHEN p_home > p_away THEN 'HOME' ELSE 'AWAY' END;
    UPDATE public.matches
       SET qualifier = v_qualifier,
           updated_at = now()
     WHERE id = p_match_id
       AND qualifier IS NULL;
  END IF;

  IF v_qualifier IS NOT NULL THEN
    v_count := v_count + public.settle_to_qualify_for_match(p_match_id, v_qualifier);
  END IF;

  v_count := v_count + public.settle_cards_corners_for_match(p_match_id);
  RETURN v_count;
END $function$;