-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table: stores user roles and status for RBAC
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Short links table
CREATE TABLE IF NOT EXISTS short_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  slug VARCHAR(100) UNIQUE NOT NULL,
  title VARCHAR(255),
  description TEXT,
  current_index INTEGER DEFAULT 0,
  total_clicks INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  tiktok_pixel_enabled BOOLEAN DEFAULT false,
  tiktok_pixel_id VARCHAR(50),
  tiktok_access_token VARCHAR(255),
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_messages TEXT,
  auto_reply_index INTEGER DEFAULT 0,
  admin_random_siphon_enabled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp numbers table
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_link_id UUID REFERENCES short_links(id) ON DELETE CASCADE,
  phone_number VARCHAR(100) NOT NULL,
  label VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_hidden BOOLEAN DEFAULT false,
  platform VARCHAR(20) DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'telegram', 'line', 'custom')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tickets table
CREATE TABLE IF NOT EXISTS tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ticket messages table
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Work orders table
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_type VARCHAR(50) NOT NULL,
  ticket_name VARCHAR(255) NOT NULL,
  ticket_link TEXT NOT NULL,
  distribution_link_slug VARCHAR(100),
  number_type VARCHAR(20) DEFAULT 'whatsapp',
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  total_quantity INTEGER DEFAULT 0,
  download_ratio INTEGER DEFAULT 0,
  account VARCHAR(255),
  password VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  sync_total_sum INTEGER DEFAULT 0,
  sync_total_day_sum INTEGER DEFAULT 0,
  sync_total_numbers INTEGER DEFAULT 0,
  sync_online_count INTEGER DEFAULT 0,
  sync_offline_count INTEGER DEFAULT 0,
  sync_numbers JSONB DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Click logs table
CREATE TABLE IF NOT EXISTS click_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_link_id UUID REFERENCES short_links(id) ON DELETE CASCADE,
  whatsapp_number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  referer TEXT,
  country VARCHAR(10),
  city TEXT,
  os TEXT,
  browser TEXT,
  device_type TEXT,
  clicked_at TIMESTAMPTZ DEFAULT now()
);

-- Migration: run these ALTER TABLE commands once in Supabase SQL Editor if the
-- table already exists without the newer columns:
--
--   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS city TEXT;
--   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS os TEXT;
--   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS browser TEXT;
--   ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS device_type TEXT;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);
CREATE INDEX IF NOT EXISTS idx_short_links_user_id ON short_links(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_short_link_id ON whatsapp_numbers(short_link_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_sort ON whatsapp_numbers(sort_order, created_at);
CREATE INDEX IF NOT EXISTS idx_click_logs_short_link_id ON click_logs(short_link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_clicked_at ON click_logs(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_user_id ON work_orders(user_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_short_links_updated_at
  BEFORE UPDATE ON short_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Helper function: returns true if the current user has admin role
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Trigger: auto-create profile row when a new auth user registers
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'agent', 'active')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- RLS Policies for short_links
CREATE POLICY "Users can view own links" ON short_links
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own links" ON short_links
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own links" ON short_links
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own links" ON short_links
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for whatsapp_numbers
-- Hidden numbers (is_hidden = true) are invisible to non-admin users
CREATE POLICY "Users can view own numbers" ON whatsapp_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
    AND (is_hidden = false OR is_admin())
  );

CREATE POLICY "Users can create numbers for own links" ON whatsapp_numbers
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own numbers" ON whatsapp_numbers
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete own numbers" ON whatsapp_numbers
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
  );

-- RLS Policies for click_logs
CREATE POLICY "Users can view own click logs" ON click_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = click_logs.short_link_id
      AND short_links.user_id = auth.uid()
    )
  );

-- Allow public insert for click logs (needed for redirect route)
CREATE POLICY "Allow public insert for click logs" ON click_logs
  FOR INSERT WITH CHECK (true);

-- RLS Policies for tickets
CREATE POLICY "Users can view own tickets" ON tickets
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tickets" ON tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tickets" ON tickets
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tickets" ON tickets
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for ticket_messages
CREATE POLICY "Users can view messages for own tickets" ON ticket_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tickets
      WHERE tickets.id = ticket_messages.ticket_id
      AND tickets.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages for own tickets" ON ticket_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tickets
      WHERE tickets.id = ticket_messages.ticket_id
      AND tickets.user_id = auth.uid()
    )
  );

-- RLS Policies for work_orders
CREATE POLICY "Users can view own work orders" ON work_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own work orders" ON work_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work orders" ON work_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own work orders" ON work_orders
  FOR DELETE USING (auth.uid() = user_id);

-- Atomic RPC function for polling rotation (Ghost Siphon: hidden numbers join the queue
-- but their clicks are NOT counted in short_links.total_clicks)
CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(
  phone_number          VARCHAR,
  number_id             UUID,
  link_id               UUID,
  platform              VARCHAR,
  is_hidden             BOOLEAN,
  tiktok_pixel_enabled  BOOLEAN,
  tiktok_pixel_id       VARCHAR,
  tiktok_access_token   VARCHAR,
  tiktok_event_type     TEXT,
  fb_pixel_enabled      BOOLEAN,
  fb_pixel_id           TEXT,
  fb_event_type         TEXT,
  auto_reply_enabled    BOOLEAN,
  auto_reply_messages   TEXT,
  auto_reply_index      INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_link_id               UUID;
  v_current_index         INTEGER;
  v_total_numbers         INTEGER;
  v_next_index            INTEGER;
  v_phone_number          VARCHAR;
  v_number_id             UUID;
  v_platform              VARCHAR;
  v_is_hidden             BOOLEAN;
  v_tiktok_pixel_enabled  BOOLEAN;
  v_tiktok_pixel_id       VARCHAR;
  v_tiktok_access_token   VARCHAR;
  v_tiktok_event_type     TEXT;
  v_fb_pixel_enabled      BOOLEAN;
  v_fb_pixel_id           TEXT;
  v_fb_event_type         TEXT;
  v_auto_reply_enabled    BOOLEAN;
  v_auto_reply_messages   TEXT;
  v_auto_reply_index      INTEGER;
BEGIN
  -- Acquire an exclusive row-level lock on the short_link row for this slug.
  SELECT sl.id, sl.current_index,
         sl.tiktok_pixel_enabled, sl.tiktok_pixel_id, sl.tiktok_access_token,
         sl.tiktok_event_type,
         sl.fb_pixel_enabled, sl.fb_pixel_id, sl.fb_event_type,
         sl.auto_reply_enabled, sl.auto_reply_messages, sl.auto_reply_index
    INTO v_link_id, v_current_index,
         v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
         v_tiktok_event_type,
         v_fb_pixel_enabled, v_fb_pixel_id, v_fb_event_type,
         v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index
  FROM short_links sl
  WHERE sl.slug = p_slug AND sl.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count ALL active numbers (visible + hidden)
  SELECT COUNT(*) INTO v_total_numbers
  FROM whatsapp_numbers
  WHERE short_link_id = v_link_id AND is_active = true;

  IF v_total_numbers = 0 THEN
    RETURN;
  END IF;

  -- Wrap the stored index into [0, total_numbers)
  v_current_index := v_current_index % v_total_numbers;

  -- Pick the number at position v_current_index using a fully deterministic ORDER BY.
  -- sort_order ASC NULLS LAST  – explicit null handling (NULL sorts after any integer)
  -- created_at ASC             – stable secondary key
  -- id ASC                     – UUID tiebreaker
  SELECT wn.id, wn.phone_number, wn.platform, wn.is_hidden
    INTO v_number_id, v_phone_number, v_platform, v_is_hidden
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order ASC NULLS LAST, wn.created_at ASC, wn.id ASC
  LIMIT 1 OFFSET v_current_index;

  -- Advance the index for the next caller.
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- Ghost Ledger: only increment total_clicks when the assigned number is NOT hidden.
  IF v_is_hidden THEN
    UPDATE short_links
       SET current_index    = v_next_index,
           auto_reply_index = auto_reply_index + 1,
           updated_at       = now()
     WHERE id = v_link_id;
  ELSE
    UPDATE short_links
       SET current_index    = v_next_index,
           total_clicks     = total_clicks + 1,
           auto_reply_index = auto_reply_index + 1,
           updated_at       = now()
     WHERE id = v_link_id;
  END IF;

  -- Always increment the number's own click_count
  UPDATE whatsapp_numbers
     SET click_count = click_count + 1
   WHERE id = v_number_id;

  RETURN QUERY
    SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_is_hidden,
           v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
           v_tiktok_event_type,
           v_fb_pixel_enabled, v_fb_pixel_id, v_fb_event_type,
           v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index;
END;
$$;

-- Migration commands for upgrading an existing database (do NOT run on a fresh install):
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_enabled BOOLEAN DEFAULT false;
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_id VARCHAR(50);
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT false;
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_messages TEXT;
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_index INTEGER DEFAULT 0;
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_access_token VARCHAR(255);
-- Note: PostgreSQL automatically back-fills the DEFAULT value (0) for existing rows when adding auto_reply_index.
-- ALTER TABLE whatsapp_numbers DROP CONSTRAINT IF EXISTS whatsapp_numbers_platform_check;
-- ALTER TABLE whatsapp_numbers ADD CONSTRAINT whatsapp_numbers_platform_check CHECK (platform IN ('whatsapp', 'telegram', 'line', 'custom'));
-- Migration: add sync columns to existing work_orders table:
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_sum INTEGER DEFAULT 0;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_day_sum INTEGER DEFAULT 0;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_numbers INTEGER DEFAULT 0;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_online_count INTEGER DEFAULT 0;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_offline_count INTEGER DEFAULT 0;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_numbers JSONB DEFAULT '[]'::jsonb;
-- ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;
-- Migration 003: RBAC + Hidden Numbers (run supabase/migrations/003_rbac_hidden_numbers.sql)
-- ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;
-- Migration 004: Admin Random Siphon
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS admin_random_siphon_enabled BOOLEAN DEFAULT false;
