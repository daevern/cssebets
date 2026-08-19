TRUNCATE cron.job_run_details;

DELETE FROM public.f1_race_odds_snapshots WHERE snapshot_at < now() - interval '7 days';

SELECT cron.alter_job(211, schedule => '17 * * * *');
SELECT cron.alter_job(212, schedule => '37 * * * *');