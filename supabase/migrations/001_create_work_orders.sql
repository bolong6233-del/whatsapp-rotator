-- Ensure the updated_at trigger function exists (it may already be defined in schema.sql)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Work orders table
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  ticket_type VARCHAR(50) NOT NULL,
  ticket_name VARCHAR(255) NOT NULL,
  ticket_link TEXT NOT NULL,
  distribution_link_slug VARCHAR(100) NOT NULL,
  number_type VARCHAR(20) NOT NULL DEFAULT 'whatsapp' CHECK (number_type IN ('whatsapp', 'telegram', 'line', 'custom')),
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  total_quantity INTEGER NOT NULL DEFAULT 0,
  download_ratio INTEGER NOT NULL DEFAULT 0,
  account VARCHAR(255),
  password VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
  -- Sync fields (persisted to DB)
  sync_total_sum INTEGER,
  sync_total_day_sum INTEGER,
  sync_total_numbers INTEGER,
  sync_online_count INTEGER,
  sync_offline_count INTEGER,
  sync_numbers JSONB,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_work_orders_user_id ON work_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);

-- Updated_at trigger
CREATE TRIGGER update_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own work orders" ON work_orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own work orders" ON work_orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own work orders" ON work_orders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own work orders" ON work_orders
  FOR DELETE USING (auth.uid() = user_id);
