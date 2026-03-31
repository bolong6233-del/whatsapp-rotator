-- Migration: Auto-cleanup click_logs older than 3 days using pg_cron
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Note: pg_cron must be enabled on your Supabase project.
-- Go to Database > Extensions and enable "pg_cron" if not already enabled.

-- Enable pg_cron extension (safe to run multiple times)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily cleanup at 3:00 AM UTC
-- Deletes click_logs records older than 3 days
SELECT cron.schedule(
  'clean-old-click-logs',        -- job name (must be unique)
  '0 3 * * *',                   -- cron expression: every day at 03:00 UTC
  $$DELETE FROM click_logs WHERE clicked_at < NOW() - INTERVAL '3 days'$$
);

-- To verify the job was created:
-- SELECT * FROM cron.job WHERE jobname = 'clean-old-click-logs';

-- To manually run cleanup immediately (optional):
-- DELETE FROM click_logs WHERE clicked_at < NOW() - INTERVAL '3 days';

-- To remove the scheduled job:
-- SELECT cron.unschedule('clean-old-click-logs');

-- To change to 7-day retention instead:
-- SELECT cron.unschedule('clean-old-click-logs');
-- SELECT cron.schedule(
--   'clean-old-click-logs',
--   '0 3 * * *',
--   $$DELETE FROM click_logs WHERE clicked_at < NOW() - INTERVAL '7 days'$$
-- );
