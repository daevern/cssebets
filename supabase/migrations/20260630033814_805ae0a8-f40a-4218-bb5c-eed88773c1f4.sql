DELETE FROM public.match_events e
USING public.match_events e2
WHERE e.match_id = e2.match_id
  AND e.side = e2.side
  AND lower(e.type) = lower(e2.type)
  AND COALESCE(e.minute,0) + COALESCE(e.extra_minute,0) = COALESCE(e2.minute,0) + COALESCE(e2.extra_minute,0)
  AND regexp_replace(lower(COALESCE(e.player_name,'')), '[^a-z ]','','g') !~ ('(^| )' || regexp_replace(lower(split_part(COALESCE(e2.player_name,''),' ',-1)),'[^a-z]','','g') || '($| )') = false
  AND e.ctid < e2.ctid;

-- Simpler safer pass: collapse by (match,side,type,effMin,lastname)
WITH ranked AS (
  SELECT ctid,
         match_id, side, lower(type) AS t,
         (COALESCE(minute,0) + COALESCE(extra_minute,0)) AS eff,
         lower(regexp_replace(split_part(COALESCE(player_name,''), ' ', -1), '[^A-Za-z]', '', 'g')) AS lname,
         row_number() OVER (
           PARTITION BY match_id, side, lower(type),
             (COALESCE(minute,0) + COALESCE(extra_minute,0)),
             lower(regexp_replace(split_part(COALESCE(player_name,''), ' ', -1), '[^A-Za-z]', '', 'g'))
           ORDER BY length(COALESCE(player_name,'')) DESC, ctid
         ) AS rn
  FROM public.match_events
)
DELETE FROM public.match_events me
USING ranked r
WHERE me.ctid = r.ctid AND r.rn > 1;