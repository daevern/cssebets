SELECT cron.unschedule('prune-ops-history');
SELECT cron.schedule('prune-ops-history', '*/2 * * * *', $$SELECT public.prune_ops_history(25000); SELECT public.prune_sync_runs(10000);$$);