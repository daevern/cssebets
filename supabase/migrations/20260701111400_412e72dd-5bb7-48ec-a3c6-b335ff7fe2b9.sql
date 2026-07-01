
CREATE OR REPLACE FUNCTION public._correlation_groups_for(
  p_market_text text,
  p_market      text,
  p_selection   text,
  p_outcome     text
) RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  mk    text := public._exposure_norm(COALESCE(NULLIF(p_market_text,''), p_market));
  sel   text := public._exposure_norm(COALESCE(NULLIF(p_selection,''), p_outcome));
  parts text[];
  hg    int; ag int;
  line  numeric;
  groups text[] := ARRAY[]::text[];
BEGIN
  IF position(':' IN sel) > 0 THEN sel := split_part(sel,':',2); END IF;

  IF mk IN ('RESULT','MATCH_RESULT','1X2','FT_RESULT') THEN
    IF sel IN ('HOME','H','1')  THEN groups := groups || ARRAY['HOME_DOMINANCE']; END IF;
    IF sel IN ('AWAY','A','2')  THEN groups := groups || ARRAY['AWAY_DOMINANCE']; END IF;
    IF sel IN ('DRAW','X','D')  THEN groups := groups || ARRAY['LOW_SCORE_DRAW']; END IF;

  ELSIF mk IN ('DOUBLE_CHANCE','DC') THEN
    IF sel IN ('HOME_OR_DRAW','1X') THEN groups := groups || ARRAY['HOME_DOMINANCE','LOW_SCORE_DRAW']; END IF;
    IF sel IN ('AWAY_OR_DRAW','X2') THEN groups := groups || ARRAY['AWAY_DOMINANCE','LOW_SCORE_DRAW']; END IF;

  ELSIF mk IN ('DRAW_NO_BET','DNB') THEN
    IF sel IN ('HOME','H','1') THEN groups := groups || ARRAY['HOME_DOMINANCE']; END IF;
    IF sel IN ('AWAY','A','2') THEN groups := groups || ARRAY['AWAY_DOMINANCE']; END IF;

  ELSIF mk IN ('CORRECT_SCORE','CS') THEN
    parts := regexp_matches(sel, '^(\d+)[-_](\d+)$');
    IF parts IS NOT NULL THEN
      hg := parts[1]::int; ag := parts[2]::int;
      IF hg > ag THEN groups := groups || ARRAY['HOME_DOMINANCE']; END IF;
      IF ag > hg THEN groups := groups || ARRAY['AWAY_DOMINANCE']; END IF;
      IF hg = ag AND (hg + ag) <= 2 THEN groups := groups || ARRAY['LOW_SCORE_DRAW']; END IF;
      IF hg >= 1 AND ag >= 1 AND (hg + ag) >= 3 THEN groups := groups || ARRAY['HIGH_SCORE_BTTS']; END IF;
    END IF;

  ELSIF mk LIKE 'OVER_UNDER_%' THEN
    BEGIN
      line := regexp_replace(mk, '^OVER_UNDER_(\d+)_(\d+)$', '\1.\2')::numeric;
    EXCEPTION WHEN OTHERS THEN line := NULL; END;
    IF line IS NULL THEN
      BEGIN
        line := regexp_replace(sel, '^(OVER|UNDER)_(\d+)_(\d+)$', '\2.\3')::numeric;
      EXCEPTION WHEN OTHERS THEN line := NULL; END;
    END IF;
    IF sel LIKE 'OVER%'  AND COALESCE(line,0) >= 2 THEN groups := groups || ARRAY['HIGH_SCORE_BTTS']; END IF;
    IF sel LIKE 'UNDER%' AND COALESCE(line,99) <= 3 THEN groups := groups || ARRAY['LOW_SCORE_DRAW']; END IF;

  ELSIF mk IN ('BTTS','BOTH_TEAMS_TO_SCORE') THEN
    IF sel IN ('YES','Y','TRUE') THEN groups := groups || ARRAY['HIGH_SCORE_BTTS']; END IF;
    IF sel IN ('NO','N','FALSE') THEN groups := groups || ARRAY['LOW_SCORE_DRAW']; END IF;

  ELSIF mk = 'CLEAN_SHEET_HOME' AND sel IN ('YES','Y') THEN groups := groups || ARRAY['HOME_DOMINANCE'];
  ELSIF mk = 'CLEAN_SHEET_AWAY' AND sel IN ('YES','Y') THEN groups := groups || ARRAY['AWAY_DOMINANCE'];
  ELSIF mk = 'WIN_TO_NIL_HOME'  AND sel IN ('YES','Y') THEN groups := groups || ARRAY['HOME_DOMINANCE'];
  ELSIF mk = 'WIN_TO_NIL_AWAY'  AND sel IN ('YES','Y') THEN groups := groups || ARRAY['AWAY_DOMINANCE'];

  ELSIF mk LIKE '%CORNER%' THEN
    IF sel LIKE 'OVER%' THEN groups := groups || ARRAY['CORNER_HEAVY']; END IF;
    IF mk LIKE 'HOME_CORNERS_%' AND sel LIKE 'OVER%' THEN groups := groups || ARRAY['HOME_DOMINANCE']; END IF;
    IF mk LIKE 'AWAY_CORNERS_%' AND sel LIKE 'OVER%' THEN groups := groups || ARRAY['AWAY_DOMINANCE']; END IF;

  ELSIF mk LIKE '%CARD%' THEN
    IF sel LIKE 'OVER%' OR sel IN ('YES','Y','TRUE') THEN groups := groups || ARRAY['CARD_HEAVY']; END IF;
    IF mk LIKE 'HOME_CARDS_%' AND sel LIKE 'OVER%' THEN groups := groups || ARRAY['AWAY_DOMINANCE']; END IF;
    IF mk LIKE 'AWAY_CARDS_%' AND sel LIKE 'OVER%' THEN groups := groups || ARRAY['HOME_DOMINANCE']; END IF;

  END IF;

  SELECT ARRAY(SELECT DISTINCT unnest(groups)) INTO groups;
  RETURN groups;
END;
$$;
