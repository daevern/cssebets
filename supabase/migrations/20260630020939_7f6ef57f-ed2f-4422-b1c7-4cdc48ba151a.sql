
-- match_lineups
CREATE TABLE public.match_lineups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('home','away')),
  formation text,
  coach_name text,
  team_name text,
  team_logo text,
  starters jsonb NOT NULL DEFAULT '[]'::jsonb,
  substitutes jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, side)
);
GRANT SELECT ON public.match_lineups TO anon, authenticated;
GRANT ALL ON public.match_lineups TO service_role;
ALTER TABLE public.match_lineups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "lineups readable" ON public.match_lineups FOR SELECT USING (true);

-- match_events
CREATE TABLE public.match_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  minute int,
  extra_minute int,
  side text CHECK (side IN ('home','away')),
  type text NOT NULL,
  detail text,
  player_name text,
  assist_name text,
  comments text,
  dedup_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, dedup_key)
);
CREATE INDEX match_events_match_idx ON public.match_events(match_id, minute);
GRANT SELECT ON public.match_events TO anon, authenticated;
GRANT ALL ON public.match_events TO service_role;
ALTER TABLE public.match_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events readable" ON public.match_events FOR SELECT USING (true);

-- match_stats
CREATE TABLE public.match_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('home','away')),
  possession int,
  shots_total int,
  shots_on int,
  shots_off int,
  shots_blocked int,
  shots_inside int,
  shots_outside int,
  corners int,
  offsides int,
  fouls int,
  yellow_cards int,
  red_cards int,
  saves int,
  passes_total int,
  passes_accurate int,
  passes_pct int,
  xg numeric,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, side)
);
GRANT SELECT ON public.match_stats TO anon, authenticated;
GRANT ALL ON public.match_stats TO service_role;
ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stats readable" ON public.match_stats FOR SELECT USING (true);

-- match_player_ratings
CREATE TABLE public.match_player_ratings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('home','away')),
  player_id int,
  player_name text NOT NULL,
  number int,
  position text,
  minutes int,
  rating numeric,
  goals int,
  assists int,
  shots_total int,
  shots_on int,
  passes_total int,
  passes_accuracy int,
  tackles int,
  yellow_cards int,
  red_cards int,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, side, player_name)
);
GRANT SELECT ON public.match_player_ratings TO anon, authenticated;
GRANT ALL ON public.match_player_ratings TO service_role;
ALTER TABLE public.match_player_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ratings readable" ON public.match_player_ratings FOR SELECT USING (true);

-- match_h2h (cached by normalized pair key)
CREATE TABLE public.match_h2h (
  pair_key text NOT NULL PRIMARY KEY,
  team_a text NOT NULL,
  team_b text NOT NULL,
  fixtures jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.match_h2h TO anon, authenticated;
GRANT ALL ON public.match_h2h TO service_role;
ALTER TABLE public.match_h2h ENABLE ROW LEVEL SECURITY;
CREATE POLICY "h2h readable" ON public.match_h2h FOR SELECT USING (true);

-- team_season_stats
CREATE TABLE public.team_season_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  team_key text NOT NULL,
  team_name text,
  league_id int NOT NULL,
  season int NOT NULL,
  payload jsonb NOT NULL,
  recent_form jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_key, league_id, season)
);
GRANT SELECT ON public.team_season_stats TO anon, authenticated;
GRANT ALL ON public.team_season_stats TO service_role;
ALTER TABLE public.team_season_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team stats readable" ON public.team_season_stats FOR SELECT USING (true);

-- match_injuries
CREATE TABLE public.match_injuries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('home','away')),
  player_name text NOT NULL,
  position text,
  type text,
  reason text,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, side, player_name)
);
GRANT SELECT ON public.match_injuries TO anon, authenticated;
GRANT ALL ON public.match_injuries TO service_role;
ALTER TABLE public.match_injuries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "injuries readable" ON public.match_injuries FOR SELECT USING (true);
