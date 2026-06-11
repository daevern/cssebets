
-- 1) Add new platform txn enum value for pool->bankroll transfer
ALTER TYPE public.platform_txn_type ADD VALUE IF NOT EXISTS 'match_pool_collected';

-- 2) match_stake_pools
CREATE TABLE IF NOT EXISTS public.match_stake_pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL UNIQUE REFERENCES public.matches(id) ON DELETE CASCADE,
  total_pool numeric(20,2) NOT NULL DEFAULT 0,
  home_pool numeric(20,2) NOT NULL DEFAULT 0,
  draw_pool numeric(20,2) NOT NULL DEFAULT 0,
  away_pool numeric(20,2) NOT NULL DEFAULT 0,
  settled boolean NOT NULL DEFAULT false,
  voided boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.match_stake_pools TO authenticated;
GRANT ALL ON public.match_stake_pools TO service_role;
ALTER TABLE public.match_stake_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read pools" ON public.match_stake_pools FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'member'::public.app_role) OR private.has_role(auth.uid(),'admin'::public.app_role));

-- 3) match_pool_transactions
CREATE TABLE IF NOT EXISTS public.match_pool_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  prediction_id uuid REFERENCES public.predictions(id) ON DELETE SET NULL,
  user_id uuid,
  transaction_type text NOT NULL CHECK (transaction_type IN ('stake_held','pool_transferred_to_bankroll','void_refund_from_pool')),
  amount numeric(20,2) NOT NULL,
  pool_balance_before numeric(20,2) NOT NULL,
  pool_balance_after numeric(20,2) NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS match_pool_txn_match_idx ON public.match_pool_transactions(match_id, created_at DESC);
GRANT SELECT ON public.match_pool_transactions TO authenticated;
GRANT ALL ON public.match_pool_transactions TO service_role;
ALTER TABLE public.match_pool_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read pool txns" ON public.match_pool_transactions FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(),'admin'::public.app_role));

-- updated_at trigger
CREATE TRIGGER match_stake_pools_touch BEFORE UPDATE ON public.match_stake_pools
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
