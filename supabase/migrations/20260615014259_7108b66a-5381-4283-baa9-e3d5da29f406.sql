
-- Step 1: Mark test accounts as simulation
WITH test_ids AS (
  SELECT id FROM public.profiles
  WHERE display_name ILIKE 'nerner'
     OR display_name ILIKE 'test165'
     OR display_name ILIKE 'daev'
)
UPDATE public.profiles SET is_simulation = true WHERE id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.profiles WHERE is_simulation = true
    AND (display_name ILIKE 'nerner' OR display_name ILIKE 'test165' OR display_name ILIKE 'daev')
)
UPDATE public.wallets SET is_simulation = true WHERE user_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.profiles WHERE is_simulation = true
    AND (display_name ILIKE 'nerner' OR display_name ILIKE 'test165' OR display_name ILIKE 'daev')
)
UPDATE public.wallet_transactions SET is_simulation = true WHERE user_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.profiles WHERE is_simulation = true
    AND (display_name ILIKE 'nerner' OR display_name ILIKE 'test165' OR display_name ILIKE 'daev')
)
UPDATE public.predictions SET is_simulation = true WHERE user_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.profiles WHERE is_simulation = true
    AND (display_name ILIKE 'nerner' OR display_name ILIKE 'test165' OR display_name ILIKE 'daev')
)
UPDATE public.point_requests SET is_simulation = true WHERE user_id IN (SELECT id FROM test_ids);

WITH test_ids AS (
  SELECT id FROM public.profiles WHERE is_simulation = true
    AND (display_name ILIKE 'nerner' OR display_name ILIKE 'test165' OR display_name ILIKE 'daev')
)
UPDATE public.match_pool_transactions SET is_simulation = true WHERE user_id IN (SELECT id FROM test_ids);

-- Step 2: Delete generated Sim User 001..100 accounts and all related data
WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.wallet_transactions WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.match_pool_transactions WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.predictions WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.point_requests WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.payout_requests WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.league_members WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.wallets WHERE user_id IN (SELECT id FROM sim_ids);

WITH sim_ids AS (
  SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$'
)
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM sim_ids);

-- Finally delete auth.users (cascades to profiles via FK)
DELETE FROM auth.users
WHERE id IN (SELECT id FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$');

-- Safety: drop any profile rows that remain (in case auth row was missing)
DELETE FROM public.profiles WHERE display_name ~ '^Sim User [0-9]{3}$';
