
CREATE TABLE public.match_odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'the-odds-api',
  home_odds numeric NOT NULL,
  draw_odds numeric NOT NULL,
  away_odds numeric NOT NULL,
  raw_bookmaker_count integer,
  sampled_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.match_odds_snapshots TO service_role;

ALTER TABLE public.match_odds_snapshots ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: access only via service-role admin server functions.

CREATE INDEX idx_match_odds_snapshots_match_sampled
  ON public.match_odds_snapshots(match_id, sampled_at DESC);

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS reference_odds_snapshot_id uuid
    REFERENCES public.match_odds_snapshots(id) ON DELETE SET NULL;
