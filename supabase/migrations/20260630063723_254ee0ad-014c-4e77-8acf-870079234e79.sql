CREATE OR REPLACE FUNCTION public.settle_match_all_markets_atomic(p_match_id uuid, p_home integer, p_away integer, p_home_ht integer DEFAULT NULL::integer, p_away_ht integer DEFAULT NULL::integer, p_qualifier text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int := 0;
BEGIN
  v_count := v_count + public.settle_match_atomic(p_match_id, p_home, p_away);
  v_count := v_count + public.settle_new_markets_for_match(p_match_id, p_home, p_away, p_home_ht, p_away_ht);
  IF p_qualifier IS NOT NULL THEN
    v_count := v_count + public.settle_to_qualify_for_match(p_match_id, p_qualifier);
  END IF;
  v_count := v_count + public.settle_cards_corners_for_match(p_match_id);
  RETURN v_count;
END $function$;