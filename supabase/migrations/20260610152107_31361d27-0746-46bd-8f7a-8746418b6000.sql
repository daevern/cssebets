ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS odds_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS odds_source text;