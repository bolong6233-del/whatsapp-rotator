-- Add banner settings fields to site_settings table
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS guest_banner_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS guest_banner_text TEXT;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS guest_banner_color TEXT DEFAULT 'yellow';
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS expiry_banner_enabled BOOLEAN DEFAULT true;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS expired_banner_text TEXT;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS expiring_banner_text TEXT;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS global_banner_enabled BOOLEAN DEFAULT false;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS global_banner_text TEXT;
ALTER TABLE site_settings ADD COLUMN IF NOT EXISTS global_banner_color TEXT DEFAULT 'blue';
