
-- 1. Add new enum value
ALTER TYPE public.platform_txn_type ADD VALUE IF NOT EXISTS 'payout_clawback';
