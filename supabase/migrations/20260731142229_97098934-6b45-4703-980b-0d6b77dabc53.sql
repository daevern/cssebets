SELECT cron.unschedule('phase6-selftest');
DELETE FROM public.accounting_selftest_runs WHERE label='phase6-placeholder';