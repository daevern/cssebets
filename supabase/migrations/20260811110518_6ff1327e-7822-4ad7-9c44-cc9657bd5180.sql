UPDATE public.accounting_migration_flags
   SET capacity_enforced = true,
       updated_at = now()
 WHERE product IN ('roulette', 'treasure')
   AND liability_enforced = true
   AND capacity_enforced = false;