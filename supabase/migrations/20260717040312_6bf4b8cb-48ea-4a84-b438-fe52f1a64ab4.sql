
-- F1 seasons
CREATE TABLE public.f1_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL UNIQUE,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.f1_seasons TO authenticated;
GRANT ALL ON public.f1_seasons TO service_role;
ALTER TABLE public.f1_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "seasons readable by authenticated" ON public.f1_seasons FOR SELECT TO authenticated USING (true);

-- F1 constructors
CREATE TABLE public.f1_constructors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_key text NOT NULL UNIQUE,
  provider_id int,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.f1_constructors TO authenticated;
GRANT ALL ON public.f1_constructors TO service_role;
ALTER TABLE public.f1_constructors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "constructors readable" ON public.f1_constructors FOR SELECT TO authenticated USING (true);

-- F1 drivers
CREATE TABLE public.f1_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_key text NOT NULL UNIQUE,
  provider_id int,
  name text NOT NULL,
  abbr text,
  number int,
  nationality text,
  team_key text REFERENCES public.f1_constructors(team_key),
  active boolean NOT NULL DEFAULT true,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.f1_drivers TO authenticated;
GRANT ALL ON public.f1_drivers TO service_role;
ALTER TABLE public.f1_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers readable" ON public.f1_drivers FOR SELECT TO authenticated USING (true);

-- F1 races
CREATE TABLE public.f1_races (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_key text NOT NULL UNIQUE,
  provider_id int,
  season int NOT NULL,
  round int NOT NULL,
  name text NOT NULL,
  circuit text,
  country text,
  starts_at timestamptz NOT NULL,
  quali_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled', -- scheduled | qualifying | in_progress | finished | void
  results jsonb,
  qualifying jsonb,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX f1_races_season_round_idx ON public.f1_races(season, round);
CREATE INDEX f1_races_status_idx ON public.f1_races(status);
GRANT SELECT ON public.f1_races TO authenticated;
GRANT ALL ON public.f1_races TO service_role;
ALTER TABLE public.f1_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "races readable" ON public.f1_races FOR SELECT TO authenticated USING (true);

-- F1 race markets
CREATE TABLE public.f1_race_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id uuid NOT NULL REFERENCES public.f1_races(id) ON DELETE CASCADE,
  market_type text NOT NULL, -- race_winner | podium | points_finish | head_to_head
  selection_key text NOT NULL,
  label text NOT NULL,
  secondary_selection_key text, -- for h2h: the other driver
  odds numeric(8,2) NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open | suspended | settled | void
  winning boolean,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (race_id, market_type, selection_key, secondary_selection_key)
);
CREATE INDEX f1_race_markets_race_idx ON public.f1_race_markets(race_id, market_type);
CREATE INDEX f1_race_markets_status_idx ON public.f1_race_markets(status);
GRANT SELECT ON public.f1_race_markets TO authenticated;
GRANT ALL ON public.f1_race_markets TO service_role;
ALTER TABLE public.f1_race_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "race markets readable" ON public.f1_race_markets FOR SELECT TO authenticated USING (true);

-- F1 race odds snapshots
CREATE TABLE public.f1_race_odds_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id uuid NOT NULL REFERENCES public.f1_race_markets(id) ON DELETE CASCADE,
  odds numeric(8,2) NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX f1_race_odds_snapshots_market_time_idx ON public.f1_race_odds_snapshots(market_id, snapshot_at DESC);
GRANT SELECT ON public.f1_race_odds_snapshots TO authenticated;
GRANT ALL ON public.f1_race_odds_snapshots TO service_role;
ALTER TABLE public.f1_race_odds_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1 odds snapshots readable" ON public.f1_race_odds_snapshots FOR SELECT TO authenticated USING (true);

-- F1 race bets
CREATE TABLE public.f1_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  race_id uuid NOT NULL REFERENCES public.f1_races(id),
  market_id uuid NOT NULL REFERENCES public.f1_race_markets(id),
  market_type text NOT NULL,
  selection_key text NOT NULL,
  selection_label text NOT NULL,
  stake numeric(12,2) NOT NULL,
  odds_locked numeric(8,2) NOT NULL,
  potential_payout numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'open', -- open | won | lost | void | refunded
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX f1_bets_user_idx ON public.f1_bets(user_id, created_at DESC);
CREATE INDEX f1_bets_race_status_idx ON public.f1_bets(race_id, status);
CREATE INDEX f1_bets_market_idx ON public.f1_bets(market_id);
GRANT SELECT, INSERT, UPDATE ON public.f1_bets TO authenticated;
GRANT ALL ON public.f1_bets TO service_role;
ALTER TABLE public.f1_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own f1 bets read" ON public.f1_bets FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own f1 bets insert" ON public.f1_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- F1 championship markets
CREATE TABLE public.f1_championship_markets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season int NOT NULL,
  market_type text NOT NULL, -- drivers | constructors
  selection_key text NOT NULL, -- driver_key or team_key
  label text NOT NULL,
  odds numeric(8,2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  winning boolean,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, market_type, selection_key)
);
GRANT SELECT ON public.f1_championship_markets TO authenticated;
GRANT ALL ON public.f1_championship_markets TO service_role;
ALTER TABLE public.f1_championship_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "championship markets readable" ON public.f1_championship_markets FOR SELECT TO authenticated USING (true);

-- F1 championship bets
CREATE TABLE public.f1_championship_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  market_id uuid NOT NULL REFERENCES public.f1_championship_markets(id),
  season int NOT NULL,
  market_type text NOT NULL,
  selection_key text NOT NULL,
  selection_label text NOT NULL,
  stake numeric(12,2) NOT NULL,
  odds_locked numeric(8,2) NOT NULL,
  potential_payout numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'open',
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX f1_champ_bets_user_idx ON public.f1_championship_bets(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.f1_championship_bets TO authenticated;
GRANT ALL ON public.f1_championship_bets TO service_role;
ALTER TABLE public.f1_championship_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own champ bets read" ON public.f1_championship_bets FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "own champ bets insert" ON public.f1_championship_bets FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- F1 sync runs
CREATE TABLE public.f1_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL, -- races | drivers | standings | odds | settle
  status text NOT NULL, -- ok | error | skipped
  duration_ms int,
  records int,
  error text,
  meta jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX f1_sync_runs_task_time_idx ON public.f1_sync_runs(task, started_at DESC);
GRANT SELECT ON public.f1_sync_runs TO authenticated;
GRANT ALL ON public.f1_sync_runs TO service_role;
ALTER TABLE public.f1_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync runs readable by admins" ON public.f1_sync_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- updated_at trigger (reuse existing function if present, otherwise create)
CREATE OR REPLACE FUNCTION public.f1_touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER f1_seasons_touch BEFORE UPDATE ON public.f1_seasons FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_constructors_touch BEFORE UPDATE ON public.f1_constructors FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_drivers_touch BEFORE UPDATE ON public.f1_drivers FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_races_touch BEFORE UPDATE ON public.f1_races FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_race_markets_touch BEFORE UPDATE ON public.f1_race_markets FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_bets_touch BEFORE UPDATE ON public.f1_bets FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_championship_markets_touch BEFORE UPDATE ON public.f1_championship_markets FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
CREATE TRIGGER f1_championship_bets_touch BEFORE UPDATE ON public.f1_championship_bets FOR EACH ROW EXECUTE FUNCTION public.f1_touch_updated_at();
