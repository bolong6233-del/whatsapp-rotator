-- Migration: Create site_settings table for storing system-wide configuration
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS site_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  announcement_text TEXT NOT NULL DEFAULT '如需提升短链配额或遇到问题，请联系您的专属管理员。',
  admin_contact_url TEXT NOT NULL DEFAULT 'https://t.me/TKJZYL',
  admin_contact_label TEXT NOT NULL DEFAULT '联系管理员 @TKJZYL',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_settings_single_row CHECK (id = 1)
);

-- Insert default settings row (only if table is empty)
INSERT INTO site_settings (id, announcement_text, admin_contact_url, admin_contact_label)
VALUES (1, '如需提升短链配额或遇到问题，请联系您的专属管理员。', 'https://t.me/TKJZYL', '联系管理员 @TKJZYL')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read settings (needed for guest banner and profile page)
CREATE POLICY "site_settings_read_all" ON site_settings
  FOR SELECT USING (true);

-- Only service role (used by admin API) can update settings
-- The API route uses supabase-admin (service role key) which bypasses RLS
