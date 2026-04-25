-- Migration: Add cloaking (斗篷) feature fields
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- Note: pg_cron must be enabled on your Supabase project for the cleanup job.
-- Go to Database > Extensions and enable "pg_cron" if not already enabled.

-- ============================================================
-- 1. Add cloak columns to short_links
-- ============================================================
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_audit_url text;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_mode text
  CHECK (cloak_mode IN ('cloak','open','audit')) DEFAULT 'cloak';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_target_regions text[] NOT NULL DEFAULT '{}';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_sources text[] NOT NULL DEFAULT '{}';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_block_ip_repeat boolean NOT NULL DEFAULT false;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS cloak_block_pc boolean NOT NULL DEFAULT false;

-- ============================================================
-- 2. Create cloak_ip_visits table
-- ============================================================
CREATE TABLE IF NOT EXISTS cloak_ip_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_link_id uuid NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  ip text NOT NULL,
  visit_count int NOT NULL DEFAULT 1,
  first_visit_at timestamptz NOT NULL DEFAULT now(),
  last_visit_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (short_link_id, ip)
);

CREATE INDEX IF NOT EXISTS idx_cloak_ip_visits_lookup ON cloak_ip_visits (short_link_id, ip);
CREATE INDEX IF NOT EXISTS idx_cloak_ip_visits_last_visit ON cloak_ip_visits (last_visit_at);

ALTER TABLE cloak_ip_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users can view their own cloak visits"
  ON cloak_ip_visits FOR SELECT
  USING (short_link_id IN (SELECT id FROM short_links WHERE user_id = auth.uid()));

-- ============================================================
-- 3. Add cloak result columns to click_logs
-- ============================================================
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS was_cloaked boolean NOT NULL DEFAULT false;
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS cloak_reason text;

-- ============================================================
-- 4. Cron job: clean up old cloak_ip_visits (older than 3 days)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'clean-old-cloak-ip-visits',
  '0 3 * * *',
  $$DELETE FROM cloak_ip_visits WHERE last_visit_at < NOW() - INTERVAL '3 days'$$
);

-- ============================================================
-- 5. Helper RPC: atomic upsert for cloak_ip_visits
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_cloak_ip_visit(p_short_link_id uuid, p_ip text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  INSERT INTO cloak_ip_visits (short_link_id, ip, visit_count, first_visit_at, last_visit_at)
  VALUES (p_short_link_id, p_ip, 1, now(), now())
  ON CONFLICT (short_link_id, ip)
  DO UPDATE SET
    visit_count = cloak_ip_visits.visit_count + 1,
    last_visit_at = now();
$$;

