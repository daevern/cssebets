ALTER TABLE public.ufc_fight_markets ADD COLUMN IF NOT EXISTS odds_source text;

-- Everything currently stored as method/round/total_rounds was either feed-priced
-- or synthesised; we cannot distinguish retroactively, so clear them and let the
-- next sync republish only bookmaker-backed prices.
UPDATE public.ufc_fight_markets
SET is_active = false
WHERE market_type IN ('method','round','total_rounds','three_way','handicap','distance');

-- F1: suspend all open race markets (no bookmaker odds feed available).
UPDATE public.f1_race_markets SET status = 'suspended' WHERE status = 'open';