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
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- WhatsApp numbers table
CREATE TABLE IF NOT EXISTS whatsapp_numbers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  short_link_id UUID REFERENCES short_links(id) ON DELETE CASCADE,
  phone_number VARCHAR(20) NOT NULL,
  label VARCHAR(100),
  sort_order INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
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

-- Row Level Security
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;

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

-- Atomic RPC function for polling rotation
CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(phone_number VARCHAR, number_id UUID, link_id UUID) AS $$
DECLARE
  v_link_id UUID;
  v_current_index INTEGER;
  v_total_numbers INTEGER;
  v_next_index INTEGER;
  v_phone_number VARCHAR;
  v_number_id UUID;
BEGIN
  -- Get and lock the short link
  SELECT id, current_index INTO v_link_id, v_current_index
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

  SELECT id, phone_number INTO v_number_id, v_phone_number
  FROM whatsapp_numbers
  WHERE short_link_id = v_link_id AND is_active = true
  ORDER BY sort_order, created_at
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

  RETURN QUERY SELECT v_phone_number, v_number_id, v_link_id;
END;
$$ LANGUAGE plpgsql;
