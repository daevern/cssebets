-- Relax per-user concentration caps. The previous defaults were calibrated for
-- low-odds result markets; with correct-score odds frequently above 20x they
-- triggered "too similar" rejections on a single pick. New caps preserve
-- correlated-risk control while allowing normal multi-pick score slips.

ALTER TABLE public.platform_settings
  ALTER COLUMN max_user_match_potential_payout SET DEFAULT 7500,
  ALTER COLUMN max_user_match_stake SET DEFAULT 1500,
  ALTER COLUMN max_user_match_correlated_payout SET DEFAULT 5000,
  ALTER COLUMN max_user_daily_potential_payout SET DEFAULT 25000;

UPDATE public.platform_settings
   SET max_user_match_potential_payout  = GREATEST(max_user_match_potential_payout, 7500),
       max_user_match_stake             = GREATEST(max_user_match_stake, 1500),
       max_user_match_correlated_payout = GREATEST(max_user_match_correlated_payout, 5000),
       max_user_daily_potential_payout  = GREATEST(max_user_daily_potential_payout, 25000),
       updated_at = now()
 WHERE id = 1;