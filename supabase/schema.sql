-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
  platform VARCHAR(20) DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'telegram', 'line')),
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

-- Click logs table
CREATE TABLE IF NOT EXISTS click_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_link_id UUID REFERENCES short_links(id) ON DELETE CASCADE,
  whatsapp_number_id UUID REFERENCES whatsapp_numbers(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  referer TEXT,
  country VARCHAR(10),
  clicked_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);
CREATE INDEX IF NOT EXISTS idx_short_links_user_id ON short_links(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_short_link_id ON whatsapp_numbers(short_link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_short_link_id ON click_logs(short_link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_clicked_at ON click_logs(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

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

-- Row Level Security
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

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
CREATE POLICY "Users can view own numbers" ON whatsapp_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
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

-- Atomic RPC function for polling rotation
CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(phone_number VARCHAR, number_id UUID, link_id UUID, platform VARCHAR, tiktok_pixel_enabled BOOLEAN, tiktok_pixel_id VARCHAR) AS $$
DECLARE
  v_link_id UUID;
  v_current_index INTEGER;
  v_total_numbers INTEGER;
  v_next_index INTEGER;
  v_phone_number VARCHAR;
  v_number_id UUID;
  v_platform VARCHAR;
  v_tiktok_pixel_enabled BOOLEAN;
  v_tiktok_pixel_id VARCHAR;
BEGIN
  -- Get and lock the short link
  SELECT id, current_index, short_links.tiktok_pixel_enabled, short_links.tiktok_pixel_id
    INTO v_link_id, v_current_index, v_tiktok_pixel_enabled, v_tiktok_pixel_id
  FROM short_links
  WHERE slug = p_slug AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count active numbers
  SELECT COUNT(*) INTO v_total_numbers
  FROM whatsapp_numbers
  WHERE short_link_id = v_link_id AND is_active = true;

  IF v_total_numbers = 0 THEN
    RETURN;
  END IF;

  -- Get the number at current index (modulo for safety)
  v_current_index := v_current_index % v_total_numbers;

  SELECT wn.id, wn.phone_number, wn.platform INTO v_number_id, v_phone_number, v_platform
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order, wn.created_at
  LIMIT 1 OFFSET v_current_index;

  -- Calculate next index
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- Update current_index and total_clicks atomically
  UPDATE short_links
  SET current_index = v_next_index, total_clicks = total_clicks + 1, updated_at = now()
  WHERE id = v_link_id;

  -- Increment number's click_count
  UPDATE whatsapp_numbers
  SET click_count = click_count + 1
  WHERE id = v_number_id;

  RETURN QUERY SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_tiktok_pixel_enabled, v_tiktok_pixel_id;
END;
$$ LANGUAGE plpgsql;

-- Migration commands for upgrading an existing database (do NOT run on a fresh install):
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_enabled BOOLEAN DEFAULT false;
-- ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_id VARCHAR(50);
-- ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'whatsapp' CHECK (platform IN ('whatsapp', 'telegram', 'line'));
