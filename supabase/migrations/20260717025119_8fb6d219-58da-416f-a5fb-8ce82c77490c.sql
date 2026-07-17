
-- Helper: has_role for public schema (uses existing app_role enum + user_roles table)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  );
$$;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.sports_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- 1. sports_competitions
CREATE TABLE public.sports_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_code TEXT NOT NULL,
  competition_code TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  short_name TEXT,
  country TEXT,
  logo_url TEXT,
  current_season TEXT,
  api_football_league_id INT,
  odds_api_sport_key TEXT,
  allowed_markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  fixture_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  odds_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  live_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  settlement_enabled BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports_competitions TO authenticated;
GRANT ALL ON public.sports_competitions TO service_role;
ALTER TABLE public.sports_competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_competitions_read_enabled" ON public.sports_competitions
  FOR SELECT TO authenticated USING (is_enabled = true OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "sports_competitions_admin_all" ON public.sports_competitions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_competitions_touch BEFORE UPDATE ON public.sports_competitions
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 2. sports_feature_flags
CREATE TABLE public.sports_feature_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports_feature_flags TO authenticated, anon;
GRANT ALL ON public.sports_feature_flags TO service_role;
ALTER TABLE public.sports_feature_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_flags_read_all" ON public.sports_feature_flags FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "sports_flags_admin_all" ON public.sports_feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- 3. sports_events
CREATE TABLE public.sports_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_code TEXT NOT NULL,
  competition_code TEXT NOT NULL REFERENCES public.sports_competitions(competition_code) ON DELETE RESTRICT,
  season TEXT,
  round TEXT,
  event_name TEXT,
  home_name TEXT,
  away_name TEXT,
  home_short TEXT,
  away_short TEXT,
  home_logo TEXT,
  away_logo TEXT,
  home_provider_id TEXT,
  away_provider_id TEXT,
  venue TEXT,
  timezone TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  live_minute INT,
  home_score INT,
  away_score INT,
  live_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  final_result JSONB,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  markets_open BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sports_events_lookup_idx ON public.sports_events (sport_code, competition_code, scheduled_at);
CREATE INDEX sports_events_status_idx ON public.sports_events (status, scheduled_at);
GRANT SELECT ON public.sports_events TO authenticated;
GRANT ALL ON public.sports_events TO service_role;
ALTER TABLE public.sports_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_events_read" ON public.sports_events FOR SELECT TO authenticated
  USING (is_enabled = true OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "sports_events_admin_all" ON public.sports_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_events_touch BEFORE UPDATE ON public.sports_events
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 4. sports_event_provider_mappings
CREATE TABLE public.sports_event_provider_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sports_event_id UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_competition_id TEXT,
  match_confidence NUMERIC(4,3) NOT NULL DEFAULT 1.0,
  mapping_method TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'confirmed',
  needs_review BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX sports_mappings_event_idx ON public.sports_event_provider_mappings (sports_event_id, provider);
GRANT SELECT ON public.sports_event_provider_mappings TO authenticated;
GRANT ALL ON public.sports_event_provider_mappings TO service_role;
ALTER TABLE public.sports_event_provider_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_mappings_admin_all" ON public.sports_event_provider_mappings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_mappings_touch BEFORE UPDATE ON public.sports_event_provider_mappings
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 5. sports_markets
CREATE TABLE public.sports_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sports_event_id UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE CASCADE,
  market_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Popular',
  period TEXT NOT NULL DEFAULT 'full',
  line NUMERIC,
  provider TEXT,
  provider_market_key TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  opens_at TIMESTAMPTZ,
  closes_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  settlement_result JSONB,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sports_event_id, market_key, period, line)
);
CREATE INDEX sports_markets_event_idx ON public.sports_markets (sports_event_id, status);
GRANT SELECT ON public.sports_markets TO authenticated;
GRANT ALL ON public.sports_markets TO service_role;
ALTER TABLE public.sports_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_markets_read" ON public.sports_markets FOR SELECT TO authenticated USING (true);
CREATE POLICY "sports_markets_admin_all" ON public.sports_markets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_markets_touch BEFORE UPDATE ON public.sports_markets
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 6. sports_market_selections
CREATE TABLE public.sports_market_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sports_market_id UUID NOT NULL REFERENCES public.sports_markets(id) ON DELETE CASCADE,
  selection_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  line NUMERIC,
  decimal_odds NUMERIC(10,3) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  result TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sports_market_id, selection_key)
);
CREATE INDEX sports_selections_market_idx ON public.sports_market_selections (sports_market_id);
GRANT SELECT ON public.sports_market_selections TO authenticated;
GRANT ALL ON public.sports_market_selections TO service_role;
ALTER TABLE public.sports_market_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_selections_read" ON public.sports_market_selections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sports_selections_admin_all" ON public.sports_market_selections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_selections_touch BEFORE UPDATE ON public.sports_market_selections
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 7. sports_odds_snapshots
CREATE TABLE public.sports_odds_snapshots (
  id BIGSERIAL PRIMARY KEY,
  sports_event_id UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE CASCADE,
  sports_market_id UUID REFERENCES public.sports_markets(id) ON DELETE CASCADE,
  market_key TEXT NOT NULL,
  selection_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  bookmaker TEXT,
  decimal_odds NUMERIC(10,3) NOT NULL,
  provider_ts TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sports_odds_snap_event_idx ON public.sports_odds_snapshots (sports_event_id, market_key, selection_key, fetched_at DESC);
GRANT SELECT ON public.sports_odds_snapshots TO authenticated;
GRANT ALL ON public.sports_odds_snapshots TO service_role;
ALTER TABLE public.sports_odds_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_odds_snap_read" ON public.sports_odds_snapshots FOR SELECT TO authenticated USING (true);
CREATE POLICY "sports_odds_snap_admin_all" ON public.sports_odds_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- 8. sports_results
CREATE TABLE public.sports_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sports_event_id UUID NOT NULL UNIQUE REFERENCES public.sports_events(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  final_home_score INT,
  final_away_score INT,
  ht_home_score INT,
  ht_away_score INT,
  ft_status TEXT,
  extra_time BOOLEAN NOT NULL DEFAULT false,
  penalties BOOLEAN NOT NULL DEFAULT false,
  raw_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports_results TO authenticated;
GRANT ALL ON public.sports_results TO service_role;
ALTER TABLE public.sports_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_results_read" ON public.sports_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "sports_results_admin_all" ON public.sports_results FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_results_touch BEFORE UPDATE ON public.sports_results
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 9. sports_bets
CREATE TABLE public.sports_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sports_event_id UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE RESTRICT,
  sport_code TEXT NOT NULL,
  competition_code TEXT NOT NULL,
  sports_market_id UUID NOT NULL REFERENCES public.sports_markets(id) ON DELETE RESTRICT,
  market_key TEXT NOT NULL,
  sports_selection_id UUID NOT NULL REFERENCES public.sports_market_selections(id) ON DELETE RESTRICT,
  selection_key TEXT NOT NULL,
  stake NUMERIC(14,2) NOT NULL CHECK (stake > 0),
  accepted_odds NUMERIC(10,3) NOT NULL CHECK (accepted_odds >= 1.01),
  potential_payout NUMERIC(14,2) NOT NULL,
  actual_payout NUMERIC(14,2),
  status TEXT NOT NULL DEFAULT 'pending',
  void_reason TEXT,
  provider_odds_ts TIMESTAMPTZ,
  idempotency_key TEXT UNIQUE,
  placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sports_bets_user_idx ON public.sports_bets (user_id, placed_at DESC);
CREATE INDEX sports_bets_event_idx ON public.sports_bets (sports_event_id, status);
GRANT SELECT, INSERT ON public.sports_bets TO authenticated;
GRANT ALL ON public.sports_bets TO service_role;
ALTER TABLE public.sports_bets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_bets_owner_read" ON public.sports_bets FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE POLICY "sports_bets_owner_insert" ON public.sports_bets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "sports_bets_admin_all" ON public.sports_bets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));
CREATE TRIGGER sports_bets_touch BEFORE UPDATE ON public.sports_bets
  FOR EACH ROW EXECUTE FUNCTION public.sports_touch_updated_at();

-- 10. sports_settlement_runs / items
CREATE TABLE public.sports_settlement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sports_event_id UUID NOT NULL REFERENCES public.sports_events(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',
  markets_settled INT NOT NULL DEFAULT 0,
  bets_settled INT NOT NULL DEFAULT 0,
  total_payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  triggered_by UUID,
  notes TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sports_settlement_runs TO authenticated;
GRANT ALL ON public.sports_settlement_runs TO service_role;
ALTER TABLE public.sports_settlement_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_settlement_runs_admin" ON public.sports_settlement_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

CREATE TABLE public.sports_settlement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_run_id UUID NOT NULL REFERENCES public.sports_settlement_runs(id) ON DELETE CASCADE,
  sports_market_id UUID REFERENCES public.sports_markets(id) ON DELETE SET NULL,
  sports_bet_id UUID REFERENCES public.sports_bets(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  payout NUMERIC(14,2) NOT NULL DEFAULT 0,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sports_settlement_items_run_idx ON public.sports_settlement_items (settlement_run_id);
GRANT SELECT ON public.sports_settlement_items TO authenticated;
GRANT ALL ON public.sports_settlement_items TO service_role;
ALTER TABLE public.sports_settlement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_settlement_items_admin" ON public.sports_settlement_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- 11. sports_sync_runs / errors
CREATE TABLE public.sports_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  sport_code TEXT,
  competition_code TEXT,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  records_fetched INT NOT NULL DEFAULT 0,
  records_created INT NOT NULL DEFAULT 0,
  records_updated INT NOT NULL DEFAULT 0,
  records_skipped INT NOT NULL DEFAULT 0,
  api_status INT,
  retry_count INT NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX sports_sync_runs_recent_idx ON public.sports_sync_runs (started_at DESC);
GRANT SELECT ON public.sports_sync_runs TO authenticated;
GRANT ALL ON public.sports_sync_runs TO service_role;
ALTER TABLE public.sports_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_sync_runs_admin" ON public.sports_sync_runs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

CREATE TABLE public.sports_sync_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id UUID REFERENCES public.sports_sync_runs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  scope TEXT,
  message TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sports_sync_errors_recent_idx ON public.sports_sync_errors (created_at DESC);
GRANT SELECT ON public.sports_sync_errors TO authenticated;
GRANT ALL ON public.sports_sync_errors TO service_role;
ALTER TABLE public.sports_sync_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sports_sync_errors_admin" ON public.sports_sync_errors FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::public.app_role) OR public.has_role(auth.uid(),'super_admin'::public.app_role));

-- Seed competitions
INSERT INTO public.sports_competitions
  (sport_code, competition_code, display_name, short_name, country, current_season, api_football_league_id, odds_api_sport_key, display_order)
VALUES
  ('football','EPL','English Premier League','EPL','England','2025', 39, 'soccer_epl', 10),
  ('football','LA_LIGA','La Liga','La Liga','Spain','2025', 140,'soccer_spain_la_liga', 20),
  ('football','SERIE_A','Serie A','Serie A','Italy','2025', 135,'soccer_italy_serie_a', 30),
  ('football','UCL','UEFA Champions League','UCL','Europe','2025', 2, 'soccer_uefa_champs_league', 40),
  ('mma','UFC','UFC','UFC','World',NULL, NULL, 'mma_mixed_martial_arts', 50),
  ('basketball','NBA','NBA','NBA','USA','2025', 12, 'basketball_nba', 60),
  ('formula_1','F1','Formula 1','F1','World','2026', NULL, NULL, 70);

-- Seed feature flags
INSERT INTO public.sports_feature_flags (key, enabled, description) VALUES
  ('football_enabled', false, 'Master switch for club football section'),
  ('epl_enabled', false, 'English Premier League'),
  ('la_liga_enabled', false, 'La Liga'),
  ('serie_a_enabled', false, 'Serie A'),
  ('ucl_enabled', false, 'UEFA Champions League'),
  ('ufc_enabled', false, 'New sports-events UFC (existing /ufc unaffected)'),
  ('nba_enabled', false, 'NBA'),
  ('f1_enabled', false, 'Formula 1'),
  ('live_football_betting_enabled', false, 'In-play football markets'),
  ('sports_settlement_enabled', false, 'Auto-settlement for new sports');
