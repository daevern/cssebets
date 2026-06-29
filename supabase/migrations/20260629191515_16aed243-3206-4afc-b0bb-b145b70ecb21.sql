
-- Backfill derived to_qualify odds for scheduled knockout matches that have h2h reference_odds.
-- Derivation: split the draw probability 50/50 between the two sides (standard
-- bookmaker convention for "To Qualify" from a 1X2 market).
INSERT INTO public.match_market_odds (match_id, market, selection, odds, source, active, generated)
SELECT
  m.id,
  'to_qualify'::text,
  s.selection,
  ROUND(s.odds::numeric, 2),
  'derived_from_h2h',
  true,
  true
FROM public.matches m
CROSS JOIN LATERAL (
  SELECT
    (1.0 / NULLIF((m.reference_odds->>'home')::numeric, 0)) AS ph,
    (1.0 / NULLIF((m.reference_odds->>'away')::numeric, 0)) AS pa,
    (1.0 / NULLIF((m.reference_odds->>'draw')::numeric, 0)) AS pd
) inv
CROSS JOIN LATERAL (
  SELECT (inv.ph + inv.pa + inv.pd) AS tot
) sums
CROSS JOIN LATERAL (
  VALUES
    ('HOME'::text, sums.tot / (inv.ph + 0.5 * inv.pd)),
    ('AWAY'::text, sums.tot / (inv.pa + 0.5 * inv.pd))
) AS s(selection, odds)
WHERE m.status = 'scheduled'
  AND m.reference_odds IS NOT NULL
  AND m.reference_odds ? 'home' AND m.reference_odds ? 'away' AND m.reference_odds ? 'draw'
  AND m.stage ~* '(FINAL|SEMI|QUARTER|ROUND_OF|LAST_)'
  AND NOT EXISTS (
    SELECT 1 FROM public.match_market_odds o
    WHERE o.match_id = m.id AND o.market = 'to_qualify'
  );
