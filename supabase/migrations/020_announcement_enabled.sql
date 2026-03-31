ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS announcement_enabled BOOLEAN DEFAULT true;
