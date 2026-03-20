-- Add sync columns to work_orders table if they don't already exist.
-- This is needed for deployments where the work_orders table was created
-- before these columns were added to 001_create_work_orders.sql.
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_sum INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_day_sum INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_numbers INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_online_count INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_offline_count INTEGER;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_numbers JSONB;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
