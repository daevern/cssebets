ALTER TYPE public.wallet_ref_type ADD VALUE IF NOT EXISTS 'fantasy_entry';
ALTER TYPE public.wallet_ref_type ADD VALUE IF NOT EXISTS 'fantasy_prize';

CREATE TABLE public.fantasy_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_player_id integer NOT NULL UNIQUE,
  name text NOT NULL,
  photo text,
  position text NOT NULL CHECK (position IN ('GK','DEF','MID','FWD')),
  team_name text NOT NULL,
  team_provider_id integer NOT NULL,
  team_logo text,
  competition_code text NOT NULL,
  price numeric(5,1) NOT NULL DEFAULT 5.0,
  total_points integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.fantasy_players TO anon, authenticated;
GRANT ALL ON public.fantasy_players TO service_role;
ALTER TABLE public.fantasy_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy players are public" ON public.fantasy_players FOR SELECT USING (true);
CREATE INDEX idx_fantasy_players_pool ON public.fantasy_players (competition_code, position, is_active);

CREATE TABLE public.fantasy_gameweeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  number integer NOT NULL,
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  deadline_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  entry_fee numeric(12,2) NOT NULL DEFAULT 100,
  prize_pool numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','live','settled')),
  competitions text[] NOT NULL DEFAULT ARRAY['EPL','LA_LIGA','SERIE_A'],
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, number)
);
GRANT SELECT ON public.fantasy_gameweeks TO anon, authenticated;
GRANT ALL ON public.fantasy_gameweeks TO service_role;
ALTER TABLE public.fantasy_gameweeks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy gameweeks are public" ON public.fantasy_gameweeks FOR SELECT USING (true);

CREATE TABLE public.fantasy_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gameweek_id uuid NOT NULL REFERENCES public.fantasy_gameweeks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  formation text NOT NULL DEFAULT '4-4-2',
  budget_used numeric(6,1) NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  rank integer,
  prize numeric(12,2) NOT NULL DEFAULT 0,
  entry_fee numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','settled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gameweek_id, user_id)
);
GRANT SELECT ON public.fantasy_entries TO authenticated;
GRANT ALL ON public.fantasy_entries TO service_role;
ALTER TABLE public.fantasy_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fantasy entries" ON public.fantasy_entries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE INDEX idx_fantasy_entries_gw ON public.fantasy_entries (gameweek_id, points DESC);

CREATE TABLE public.fantasy_entry_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.fantasy_entries(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.fantasy_players(id) ON DELETE RESTRICT,
  slot integer NOT NULL,
  role text CHECK (role IN ('captain','vice')),
  price numeric(5,1) NOT NULL DEFAULT 0,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, player_id)
);
GRANT SELECT ON public.fantasy_entry_players TO authenticated;
GRANT ALL ON public.fantasy_entry_players TO service_role;
ALTER TABLE public.fantasy_entry_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own fantasy picks" ON public.fantasy_entry_players FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.fantasy_entries e WHERE e.id = entry_id AND e.user_id = auth.uid()));

CREATE TABLE public.fantasy_player_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gameweek_id uuid NOT NULL REFERENCES public.fantasy_gameweeks(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.fantasy_players(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  minutes integer NOT NULL DEFAULT 0,
  goals integer NOT NULL DEFAULT 0,
  assists integer NOT NULL DEFAULT 0,
  clean_sheet boolean NOT NULL DEFAULT false,
  goals_conceded integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  yellow_cards integer NOT NULL DEFAULT 0,
  red_cards integer NOT NULL DEFAULT 0,
  own_goals integer NOT NULL DEFAULT 0,
  penalties_missed integer NOT NULL DEFAULT 0,
  penalties_saved integer NOT NULL DEFAULT 0,
  rating numeric(4,2),
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gameweek_id, player_id, event_id)
);
GRANT SELECT ON public.fantasy_player_scores TO anon, authenticated;
GRANT ALL ON public.fantasy_player_scores TO service_role;
ALTER TABLE public.fantasy_player_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy scores are public" ON public.fantasy_player_scores FOR SELECT USING (true);
CREATE INDEX idx_fantasy_scores_gw ON public.fantasy_player_scores (gameweek_id, player_id);

CREATE TABLE public.fantasy_season_standings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season text NOT NULL,
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  entries integer NOT NULL DEFAULT 0,
  prize_total numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, user_id)
);
GRANT SELECT ON public.fantasy_season_standings TO anon, authenticated;
GRANT ALL ON public.fantasy_season_standings TO service_role;
ALTER TABLE public.fantasy_season_standings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fantasy season table is public" ON public.fantasy_season_standings FOR SELECT USING (true);

CREATE TRIGGER trg_fantasy_players_updated BEFORE UPDATE ON public.fantasy_players
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fantasy_gameweeks_updated BEFORE UPDATE ON public.fantasy_gameweeks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fantasy_entries_updated BEFORE UPDATE ON public.fantasy_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fantasy_scores_updated BEFORE UPDATE ON public.fantasy_player_scores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();