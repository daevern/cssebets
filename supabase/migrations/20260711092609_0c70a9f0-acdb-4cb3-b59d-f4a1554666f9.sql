
-- 1. Extend ufc_fights with API-MMA identifiers + card metadata
ALTER TABLE public.ufc_fights
  ADD COLUMN IF NOT EXISTS apimma_fight_id BIGINT,
  ADD COLUMN IF NOT EXISTS apimma_fighter_a_id BIGINT,
  ADD COLUMN IF NOT EXISTS apimma_fighter_b_id BIGINT,
  ADD COLUMN IF NOT EXISTS weight_class TEXT,
  ADD COLUMN IF NOT EXISTS is_title_fight BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fighter_a_logo TEXT,
  ADD COLUMN IF NOT EXISTS fighter_b_logo TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ufc_fights_apimma_fight_id_key
  ON public.ufc_fights (apimma_fight_id)
  WHERE apimma_fight_id IS NOT NULL;

-- 2. ufc_fighters
CREATE TABLE IF NOT EXISTS public.ufc_fighters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  apimma_id BIGINT UNIQUE,
  name TEXT NOT NULL,
  nickname TEXT,
  record_w INTEGER,
  record_l INTEGER,
  record_d INTEGER,
  reach_cm NUMERIC,
  height_cm NUMERIC,
  stance TEXT,
  dob DATE,
  weight_class TEXT,
  country TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ufc_fighters TO authenticated;
GRANT ALL ON public.ufc_fighters TO service_role;
ALTER TABLE public.ufc_fighters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_fighters read for authenticated"
  ON public.ufc_fighters FOR SELECT TO authenticated USING (true);

-- 3. ufc_fight_stats (live in-fight stats, one row per fighter per fight)
CREATE TABLE IF NOT EXISTS public.ufc_fight_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fight_id UUID NOT NULL REFERENCES public.ufc_fights(id) ON DELETE CASCADE,
  fighter_slot TEXT NOT NULL CHECK (fighter_slot IN ('a','b')),
  strikes_landed INTEGER,
  strikes_attempted INTEGER,
  significant_strikes_landed INTEGER,
  significant_strikes_attempted INTEGER,
  takedowns_landed INTEGER,
  takedowns_attempted INTEGER,
  submission_attempts INTEGER,
  knockdowns INTEGER,
  control_time_sec INTEGER,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fight_id, fighter_slot)
);

GRANT SELECT ON public.ufc_fight_stats TO authenticated;
GRANT ALL ON public.ufc_fight_stats TO service_role;
ALTER TABLE public.ufc_fight_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_fight_stats read for authenticated"
  ON public.ufc_fight_stats FOR SELECT TO authenticated USING (true);

-- 4. ufc_fight_h2h (past meetings between two fighters)
CREATE TABLE IF NOT EXISTS public.ufc_fight_h2h (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fight_id UUID NOT NULL REFERENCES public.ufc_fights(id) ON DELETE CASCADE,
  past_fight_apimma_id BIGINT,
  date DATE,
  event_name TEXT,
  winner_slot TEXT CHECK (winner_slot IN ('a','b','draw','nc')),
  method TEXT,
  round INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (fight_id, past_fight_apimma_id)
);

GRANT SELECT ON public.ufc_fight_h2h TO authenticated;
GRANT ALL ON public.ufc_fight_h2h TO service_role;
ALTER TABLE public.ufc_fight_h2h ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ufc_fight_h2h read for authenticated"
  ON public.ufc_fight_h2h FOR SELECT TO authenticated USING (true);

-- 5. Snapshot capture time index for movement charts
CREATE INDEX IF NOT EXISTS ufc_market_snapshots_fight_time_idx
  ON public.ufc_market_snapshots (fight_id, market_type, sampled_at);

-- 6. updated_at trigger for fighters + fight_stats
CREATE OR REPLACE FUNCTION public.ufc_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS ufc_fighters_touch ON public.ufc_fighters;
CREATE TRIGGER ufc_fighters_touch BEFORE UPDATE ON public.ufc_fighters
FOR EACH ROW EXECUTE FUNCTION public.ufc_touch_updated_at();

DROP TRIGGER IF EXISTS ufc_fight_stats_touch ON public.ufc_fight_stats;
CREATE TRIGGER ufc_fight_stats_touch BEFORE UPDATE ON public.ufc_fight_stats
FOR EACH ROW EXECUTE FUNCTION public.ufc_touch_updated_at();

-- 7. Enable realtime on live stats
ALTER PUBLICATION supabase_realtime ADD TABLE public.ufc_fight_stats;
