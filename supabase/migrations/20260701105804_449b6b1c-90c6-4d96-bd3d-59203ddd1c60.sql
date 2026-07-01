
-- =========================================================
-- Phase 9: market_rules foundation (catalog only; no behavior change)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.market_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_key text NOT NULL UNIQUE,
  market_aliases text[] NOT NULL DEFAULT '{}',
  display_name text NOT NULL,
  category text NOT NULL,
  settlement_basis text NOT NULL,
  data_required text[] NOT NULL DEFAULT '{}',
  void_conditions text[] NOT NULL DEFAULT '{}',
  supported_outcomes text[] NOT NULL DEFAULT '{}',
  is_scoreline_dependent boolean NOT NULL DEFAULT false,
  is_stat_dependent boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  risk_notes text,
  audit_notes text,
  user_facing_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.market_rules IS
  'Phase 9 foundation: canonical catalog of every offered market. Documentation/reference only — settlement, wallet, accounting, and risk code do NOT read from this table yet.';

GRANT SELECT ON public.market_rules TO authenticated;
GRANT ALL ON public.market_rules TO service_role;

ALTER TABLE public.market_rules ENABLE ROW LEVEL SECURITY;

-- Admins see everything
DROP POLICY IF EXISTS "Admins read all market rules" ON public.market_rules;
CREATE POLICY "Admins read all market rules"
  ON public.market_rules FOR SELECT TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- Normal users see only active rules
DROP POLICY IF EXISTS "Users read active market rules" ON public.market_rules;
CREATE POLICY "Users read active market rules"
  ON public.market_rules FOR SELECT TO authenticated
  USING (is_active = true);

-- Only admins write
DROP POLICY IF EXISTS "Admins insert market rules" ON public.market_rules;
CREATE POLICY "Admins insert market rules"
  ON public.market_rules FOR INSERT TO authenticated
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins update market rules" ON public.market_rules;
CREATE POLICY "Admins update market rules"
  ON public.market_rules FOR UPDATE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  )
  WITH CHECK (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins delete market rules" ON public.market_rules;
CREATE POLICY "Admins delete market rules"
  ON public.market_rules FOR DELETE TO authenticated
  USING (
    private.has_role(auth.uid(), 'admin'::app_role)
    OR private.has_role(auth.uid(), 'super_admin'::app_role)
  );

-- updated_at trigger (reuse project's touch_updated_at helper)
DROP TRIGGER IF EXISTS trg_market_rules_touch ON public.market_rules;
CREATE TRIGGER trg_market_rules_touch
  BEFORE UPDATE ON public.market_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =========================================================
-- Seed rules for every market currently offered.
-- Legacy DB keys (1x2, total_goals, odd_even, exact_goals) recorded as aliases.
-- =========================================================
INSERT INTO public.market_rules
  (market_key, market_aliases, display_name, category, settlement_basis,
   data_required, void_conditions, supported_outcomes,
   is_scoreline_dependent, is_stat_dependent, is_active,
   risk_notes, user_facing_note)
VALUES
  ('match_result', ARRAY['1x2'], 'Match Result (1X2)', 'result',
   'Official 90-minute full-time result. Extra time and penalties excluded unless the app configuration for the specific match says otherwise.',
   ARRAY['home_goals','away_goals','match_status'],
   ARRAY['official result unavailable','match abandoned','market cancelled'],
   ARRAY['HOME','DRAW','AWAY'], true, false, true,
   'Highest-liquidity market; monitor exposure per outcome.',
   'Settled on the official 90-minute full-time result.'),

  ('double_chance', ARRAY[]::text[], 'Double Chance', 'result',
   'Official 90-minute full-time result. Pays if the covered outcome occurs.',
   ARRAY['home_goals','away_goals','match_status'],
   ARRAY['official result unavailable','match abandoned','market cancelled'],
   ARRAY['HOME_OR_DRAW','HOME_OR_AWAY','DRAW_OR_AWAY'], true, false, true,
   'Correlated with match_result — enforce combined exposure caps.',
   'Settled on the official 90-minute full-time result.'),

  ('draw_no_bet', ARRAY[]::text[], 'Draw No Bet', 'result',
   'Official 90-minute full-time result. Stake refunded on a draw.',
   ARRAY['home_goals','away_goals','match_status'],
   ARRAY['official result unavailable','match abandoned','market cancelled'],
   ARRAY['HOME','AWAY'], true, false, true,
   'Correlated with match_result; refund path must run before payout.',
   'Stake refunded if the match ends in a draw.'),

  ('to_qualify', ARRAY[]::text[], 'To Qualify / Advance', 'result',
   'Team that officially advances to the next round after extra time and penalties, per official competition result.',
   ARRAY['qualifier_team_id','match_status'],
   ARRAY['official qualifier unavailable','tie abandoned','market cancelled'],
   ARRAY['HOME','AWAY'], false, false, true,
   'Knockout-only. Settlement waits for official qualifier confirmation.',
   'Settled on the team that officially advances (includes extra time and penalties).'),

  ('half_time_full_time', ARRAY[]::text[], 'Half-Time / Full-Time', 'result',
   'Official half-time result combined with official 90-minute full-time result.',
   ARRAY['ht_home_goals','ht_away_goals','home_goals','away_goals','match_status'],
   ARRAY['half-time or full-time result unavailable','match abandoned'],
   ARRAY['HOME_HOME','HOME_DRAW','HOME_AWAY','DRAW_HOME','DRAW_DRAW','DRAW_AWAY','AWAY_HOME','AWAY_DRAW','AWAY_AWAY'],
   true, false, true,
   'Nine outcomes — thin liquidity per selection; low individual caps.',
   'Settled on official half-time and 90-minute full-time results.'),

  ('over_under_0_5', ARRAY['total_goals'], 'Over / Under 0.5 Goals', 'goals',
   'Total official 90-minute goals compared to 0.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_0_5','UNDER_0_5'], true, false, false,
   NULL, 'Settled on official 90-minute goals.'),

  ('over_under_1_5', ARRAY['total_goals'], 'Over / Under 1.5 Goals', 'goals',
   'Total official 90-minute goals compared to 1.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_1_5','UNDER_1_5'], true, false, true,
   NULL, 'Settled on official 90-minute goals.'),

  ('over_under_2_5', ARRAY['total_goals'], 'Over / Under 2.5 Goals', 'goals',
   'Total official 90-minute goals compared to 2.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_2_5','UNDER_2_5'], true, false, true,
   'Highest-volume goals line — watch combined exposure with BTTS/correct_score.',
   'Settled on official 90-minute goals.'),

  ('over_under_3_5', ARRAY['total_goals'], 'Over / Under 3.5 Goals', 'goals',
   'Total official 90-minute goals compared to 3.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_3_5','UNDER_3_5'], true, false, true,
   NULL, 'Settled on official 90-minute goals.'),

  ('over_under_4_5', ARRAY['total_goals'], 'Over / Under 4.5 Goals', 'goals',
   'Total official 90-minute goals compared to 4.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_4_5','UNDER_4_5'], true, false, false,
   NULL, 'Settled on official 90-minute goals.'),

  ('over_under_5_5', ARRAY['total_goals'], 'Over / Under 5.5 Goals', 'goals',
   'Total official 90-minute goals compared to 5.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_5_5','UNDER_5_5'], true, false, false,
   NULL, 'Settled on official 90-minute goals.'),

  ('over_under_6_5', ARRAY['total_goals'], 'Over / Under 6.5 Goals', 'goals',
   'Total official 90-minute goals compared to 6.5.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_6_5','UNDER_6_5'], true, false, false,
   NULL, 'Settled on official 90-minute goals.'),

  ('btts', ARRAY[]::text[], 'Both Teams To Score', 'goals',
   'Both teams must score at least one official 90-minute goal.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['YES','NO'], true, false, true,
   'Highly correlated with over_under lines and correct_score.',
   'Settled on official 90-minute goals for each team.'),

  ('correct_score', ARRAY[]::text[], 'Correct Score', 'scoreline',
   'Exact official 90-minute score. Any score not offered as an outcome settles the OTHER selection.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['0-0','1-0','0-1','1-1','2-0','0-2','2-1','1-2','2-2','3-0','0-3','3-1','1-3','3-2','2-3','3-3','4-0','0-4','4-1','1-4','4-2','2-4','OTHER'],
   true, false, true,
   'Highest per-selection payout — enforce tight per-selection caps.',
   'Settled on the exact official 90-minute score.'),

  ('exact_total_goals', ARRAY['exact_goals'], 'Exact Total Goals', 'goals',
   'Exact official 90-minute total goals bucket.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['GOALS_0','GOALS_1','GOALS_2','GOALS_3','GOALS_4','GOALS_5_PLUS'],
   true, false, false,
   NULL, 'Settled on official 90-minute total goals.'),

  ('goals_odd_even', ARRAY['odd_even'], 'Total Goals Odd / Even', 'goals',
   'Parity of official 90-minute total goals. 0-0 settles as EVEN.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['ODD','EVEN'], true, false, true,
   NULL, 'Settled on official 90-minute total goals (0-0 counts as Even).'),

  ('clean_sheet_home', ARRAY[]::text[], 'Home Clean Sheet', 'goals',
   'Home team concedes zero goals in official 90 minutes.',
   ARRAY['away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['YES','NO'], true, false, true,
   NULL, 'Settled on official 90-minute goals conceded.'),

  ('clean_sheet_away', ARRAY[]::text[], 'Away Clean Sheet', 'goals',
   'Away team concedes zero goals in official 90 minutes.',
   ARRAY['home_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['YES','NO'], true, false, true,
   NULL, 'Settled on official 90-minute goals conceded.'),

  ('win_to_nil_home', ARRAY[]::text[], 'Home Win to Nil', 'goals',
   'Home team wins the 90-minute match and concedes zero goals.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['YES','NO'], true, false, false,
   NULL, 'Settled on official 90-minute result.'),

  ('win_to_nil_away', ARRAY[]::text[], 'Away Win to Nil', 'goals',
   'Away team wins the 90-minute match and concedes zero goals.',
   ARRAY['home_goals','away_goals'],
   ARRAY['official score unavailable','match abandoned'],
   ARRAY['YES','NO'], true, false, false,
   NULL, 'Settled on official 90-minute result.'),

  ('cards_over_under_2_5', ARRAY[]::text[], 'Total Cards Over / Under 2.5', 'cards',
   'Total official 90-minute cards (yellow + red) compared to 2.5.',
   ARRAY['home_cards','away_cards','total_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_2_5','UNDER_2_5'], false, true, false,
   NULL,
   'Settled on official 90-minute card counts. Stake refunded if official card data is unavailable.'),

  ('cards_over_under_3_5', ARRAY[]::text[], 'Total Cards Over / Under 3.5', 'cards',
   'Total official 90-minute cards (yellow + red) compared to 3.5.',
   ARRAY['home_cards','away_cards','total_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_3_5','UNDER_3_5'], false, true, true,
   NULL,
   'Settled on official 90-minute card counts. Stake refunded if official card data is unavailable.'),

  ('cards_over_under_4_5', ARRAY[]::text[], 'Total Cards Over / Under 4.5', 'cards',
   'Total official 90-minute cards (yellow + red) compared to 4.5.',
   ARRAY['home_cards','away_cards','total_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_4_5','UNDER_4_5'], false, true, true,
   NULL,
   'Settled on official 90-minute card counts. Stake refunded if official card data is unavailable.'),

  ('cards_over_under_5_5', ARRAY[]::text[], 'Total Cards Over / Under 5.5', 'cards',
   'Total official 90-minute cards (yellow + red) compared to 5.5.',
   ARRAY['home_cards','away_cards','total_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_5_5','UNDER_5_5'], false, true, false,
   NULL,
   'Settled on official 90-minute card counts. Stake refunded if official card data is unavailable.'),

  ('home_cards_over_under_1_5', ARRAY[]::text[], 'Home Cards Over / Under 1.5', 'cards',
   'Total official 90-minute cards for the home team compared to 1.5.',
   ARRAY['home_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_1_5','UNDER_1_5'], false, true, false,
   NULL,
   'Settled on official 90-minute home card count. Stake refunded if official card data is unavailable.'),

  ('away_cards_over_under_1_5', ARRAY[]::text[], 'Away Cards Over / Under 1.5', 'cards',
   'Total official 90-minute cards for the away team compared to 1.5.',
   ARRAY['away_cards'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_1_5','UNDER_1_5'], false, true, false,
   NULL,
   'Settled on official 90-minute away card count. Stake refunded if official card data is unavailable.'),

  ('red_card_match', ARRAY[]::text[], 'Red Card in Match', 'cards',
   'Whether at least one red card (including second-yellow) is shown in official 90 minutes.',
   ARRAY['red_card_count'],
   ARRAY['official card data unavailable','match abandoned','market cancelled'],
   ARRAY['YES','NO'], false, true, true,
   'Low-probability YES side — enforce per-selection caps.',
   'Settled on official 90-minute red card count. Stake refunded if official card data is unavailable.'),

  ('first_card', ARRAY[]::text[], 'First Team Carded', 'cards',
   'Team that receives the first official card in the match. If no card is shown, NONE settles as the winning selection.',
   ARRAY['first_card_team','red_card_count','home_cards','away_cards'],
   ARRAY['official card timing unavailable','match abandoned','market cancelled'],
   ARRAY['HOME','AWAY','NONE'], false, true, false,
   NULL,
   'Settled on the first official card shown. If no card is shown, "No card" wins.'),

  ('corners_over_under_8_5', ARRAY[]::text[], 'Total Corners Over / Under 8.5', 'corners',
   'Total official 90-minute corners compared to 8.5.',
   ARRAY['home_corners','away_corners','total_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_8_5','UNDER_8_5'], false, true, false,
   NULL,
   'Settled on official 90-minute corner counts. Stake refunded if official corner data is unavailable.'),

  ('corners_over_under_9_5', ARRAY[]::text[], 'Total Corners Over / Under 9.5', 'corners',
   'Total official 90-minute corners compared to 9.5.',
   ARRAY['home_corners','away_corners','total_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_9_5','UNDER_9_5'], false, true, true,
   NULL,
   'Settled on official 90-minute corner counts. Stake refunded if official corner data is unavailable.'),

  ('corners_over_under_10_5', ARRAY[]::text[], 'Total Corners Over / Under 10.5', 'corners',
   'Total official 90-minute corners compared to 10.5.',
   ARRAY['home_corners','away_corners','total_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_10_5','UNDER_10_5'], false, true, true,
   NULL,
   'Settled on official 90-minute corner counts. Stake refunded if official corner data is unavailable.'),

  ('corners_over_under_11_5', ARRAY[]::text[], 'Total Corners Over / Under 11.5', 'corners',
   'Total official 90-minute corners compared to 11.5.',
   ARRAY['home_corners','away_corners','total_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_11_5','UNDER_11_5'], false, true, false,
   NULL,
   'Settled on official 90-minute corner counts. Stake refunded if official corner data is unavailable.'),

  ('home_corners_over_under_4_5', ARRAY[]::text[], 'Home Corners Over / Under 4.5', 'corners',
   'Total official 90-minute corners for the home team compared to 4.5.',
   ARRAY['home_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_4_5','UNDER_4_5'], false, true, true,
   NULL,
   'Settled on official 90-minute home corner count. Stake refunded if official corner data is unavailable.'),

  ('away_corners_over_under_4_5', ARRAY[]::text[], 'Away Corners Over / Under 4.5', 'corners',
   'Total official 90-minute corners for the away team compared to 4.5.',
   ARRAY['away_corners'],
   ARRAY['official corner data unavailable','match abandoned','market cancelled'],
   ARRAY['OVER_4_5','UNDER_4_5'], false, true, true,
   NULL,
   'Settled on official 90-minute away corner count. Stake refunded if official corner data is unavailable.'),

  ('first_corner', ARRAY[]::text[], 'First Corner', 'corners',
   'Team that wins the first official corner in the match. If no corner is awarded, NONE settles as the winning selection.',
   ARRAY['first_corner_team','total_corners'],
   ARRAY['official corner timing unavailable','match abandoned','market cancelled'],
   ARRAY['HOME','AWAY','NONE'], false, true, false,
   NULL,
   'Settled on the first official corner. If no corner is awarded, "No corner" wins.')
ON CONFLICT (market_key) DO UPDATE SET
  market_aliases = EXCLUDED.market_aliases,
  display_name = EXCLUDED.display_name,
  category = EXCLUDED.category,
  settlement_basis = EXCLUDED.settlement_basis,
  data_required = EXCLUDED.data_required,
  void_conditions = EXCLUDED.void_conditions,
  supported_outcomes = EXCLUDED.supported_outcomes,
  is_scoreline_dependent = EXCLUDED.is_scoreline_dependent,
  is_stat_dependent = EXCLUDED.is_stat_dependent,
  is_active = EXCLUDED.is_active,
  risk_notes = EXCLUDED.risk_notes,
  user_facing_note = EXCLUDED.user_facing_note,
  updated_at = now();
