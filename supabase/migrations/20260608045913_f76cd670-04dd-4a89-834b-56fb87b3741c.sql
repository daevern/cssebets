
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin','member','pending');
CREATE TYPE public.match_status AS ENUM ('scheduled','live','finished','postponed','cancelled');
CREATE TYPE public.prediction_market AS ENUM ('result','correct_score','total_goals','btts','first_scorer','tournament_winner','group_winner');
CREATE TYPE public.prediction_status AS ENUM ('pending','won','lost','void');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- USER ROLES
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Admins view all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- LEAGUES
CREATE TABLE public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leagues TO authenticated;
GRANT ALL ON public.leagues TO service_role;
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view leagues" ON public.leagues FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'member') OR public.has_role(auth.uid(),'admin')
);

-- LEAGUE MEMBERS
CREATE TABLE public.league_members (
  league_id UUID NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);
GRANT SELECT ON public.league_members TO authenticated;
GRANT ALL ON public.league_members TO service_role;
ALTER TABLE public.league_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view league memberships" ON public.league_members FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'member') OR public.has_role(auth.uid(),'admin')
);

-- MATCHES
CREATE TABLE public.matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE,
  stage TEXT,
  group_name TEXT,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_crest TEXT,
  away_crest TEXT,
  kickoff_at TIMESTAMPTZ NOT NULL,
  status public.match_status NOT NULL DEFAULT 'scheduled',
  home_score INT,
  away_score INT,
  winner TEXT,
  reference_odds JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.matches TO authenticated;
GRANT ALL ON public.matches TO service_role;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view matches" ON public.matches FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'member') OR public.has_role(auth.uid(),'admin')
);

-- PREDICTIONS
CREATE TABLE public.predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_id UUID REFERENCES public.matches(id) ON DELETE CASCADE,
  market public.prediction_market NOT NULL,
  outcome TEXT NOT NULL,
  reference_odds NUMERIC(8,2) NOT NULL DEFAULT 1.0,
  virtual_stake NUMERIC(12,2) NOT NULL DEFAULT 0,
  potential_return NUMERIC(14,2) NOT NULL DEFAULT 0,
  status public.prediction_status NOT NULL DEFAULT 'pending',
  points INT NOT NULL DEFAULT 0,
  settled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, match_id, market)
);
CREATE INDEX idx_predictions_user ON public.predictions(user_id);
CREATE INDEX idx_predictions_match ON public.predictions(match_id);
GRANT SELECT, INSERT ON public.predictions TO authenticated;
GRANT ALL ON public.predictions TO service_role;
ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view all predictions" ON public.predictions FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'member') OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "Users insert own pending predictions" ON public.predictions FOR INSERT TO authenticated WITH CHECK (
  auth.uid() = user_id
  AND (public.has_role(auth.uid(),'member') OR public.has_role(auth.uid(),'admin'))
  AND (
    match_id IS NULL OR EXISTS (
      SELECT 1 FROM public.matches m WHERE m.id = match_id AND m.kickoff_at > now() AND m.status = 'scheduled'
    )
  )
);

-- AUDIT LOG
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own audit" ON public.audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all audit" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- AUTO-CREATE PROFILE + PENDING ROLE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'pending');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED DEFAULT LEAGUE
INSERT INTO public.leagues (name) VALUES ('Main Pool');
