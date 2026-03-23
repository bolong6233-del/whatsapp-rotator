-- ============================================================
-- complete_schema.sql
-- WhatsApp Rotator - 完整数据库结构（幂等，可重复执行）
-- ============================================================

-- ============================================================
-- STEP 1: 扩展
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- STEP 2: 基础表
-- ============================================================

-- short_links
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
  tiktok_event_type TEXT DEFAULT 'SubmitForm',
  fb_pixel_enabled BOOLEAN DEFAULT false,
  fb_pixel_id TEXT,
  fb_event_type TEXT DEFAULT 'Lead',
  auto_reply_enabled BOOLEAN DEFAULT false,
  auto_reply_messages TEXT,
  auto_reply_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- whatsapp_numbers
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

-- click_logs
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

-- profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role VARCHAR(20) DEFAULT 'guest',
  status TEXT DEFAULT 'active',
  plain_password TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT profiles_role_check CHECK (role IN ('admin', 'agent', 'guest', 'root', 'root_admin'))
);

-- work_orders
CREATE TABLE IF NOT EXISTS work_orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL DEFAULT '云控',
  ticket_name TEXT NOT NULL,
  ticket_link TEXT NOT NULL,
  distribution_link_slug TEXT NOT NULL DEFAULT '',
  number_type TEXT NOT NULL DEFAULT 'whatsapp',
  start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  end_time TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'),
  total_quantity INTEGER NOT NULL DEFAULT 0,
  download_ratio INTEGER NOT NULL DEFAULT 0,
  account TEXT DEFAULT '',
  password TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired', 'cancelled')),
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

-- tickets (support tickets)
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

-- ticket_messages
CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticket_id UUID REFERENCES tickets(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- user_passwords (明文密码存储，供后台管理查阅)
CREATE TABLE IF NOT EXISTS public.user_passwords (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- login_logs
CREATE TABLE IF NOT EXISTS login_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  login_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  ip_address VARCHAR(50),
  device_info VARCHAR(255)
);

-- ============================================================
-- STEP 3: 补齐字段（ALTER TABLE，幂等）
-- ============================================================

-- short_links 补齐字段（老数据库兼容）
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_enabled BOOLEAN DEFAULT false;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_pixel_id VARCHAR(50);
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_access_token VARCHAR(255);
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS tiktok_event_type TEXT DEFAULT 'SubmitForm';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_enabled BOOLEAN DEFAULT false;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_pixel_id TEXT;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS fb_event_type TEXT DEFAULT 'Lead';
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_enabled BOOLEAN DEFAULT false;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_messages TEXT;
ALTER TABLE short_links ADD COLUMN IF NOT EXISTS auto_reply_index INTEGER DEFAULT 0;

-- whatsapp_numbers 补齐字段
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- click_logs 补齐字段
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS os TEXT;
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS browser TEXT;
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS device_type TEXT;
ALTER TABLE click_logs ADD COLUMN IF NOT EXISTS referer TEXT;

-- profiles 补齐字段
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'guest';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plain_password TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID;

-- 修复 profiles role 约束（先删后加）
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'guest', 'root', 'root_admin'));

-- work_orders 补齐同步字段
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_sum INTEGER DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_day_sum INTEGER DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_total_numbers INTEGER DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_online_count INTEGER DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_offline_count INTEGER DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS sync_numbers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- ============================================================
-- STEP 4: 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_short_links_slug ON short_links(slug);
CREATE INDEX IF NOT EXISTS idx_short_links_user_id ON short_links(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_numbers_short_link_id ON whatsapp_numbers(short_link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_short_link_id ON click_logs(short_link_id);
CREATE INDEX IF NOT EXISTS idx_click_logs_clicked_at ON click_logs(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

-- ============================================================
-- STEP 5: Trigger 函数（updated_at 自动更新）
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_short_links_updated_at ON short_links;
CREATE TRIGGER update_short_links_updated_at
  BEFORE UPDATE ON short_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tickets_updated_at ON tickets;
CREATE TRIGGER update_tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_work_orders_updated_at ON work_orders;
CREATE TRIGGER update_work_orders_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- STEP 6: 新用户注册自动写入 profiles 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, status)
  VALUES (NEW.id, NEW.email, 'guest', 'active')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- STEP 7: 核心轮询发号函数（最终版，含隐藏号逻辑）
-- ============================================================
DROP FUNCTION IF EXISTS increment_and_get_number(VARCHAR);

CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(
  phone_number VARCHAR,
  number_id UUID,
  link_id UUID,
  platform VARCHAR,
  is_hidden BOOLEAN,
  tiktok_pixel_enabled BOOLEAN,
  tiktok_pixel_id VARCHAR,
  tiktok_access_token VARCHAR,
  auto_reply_enabled BOOLEAN,
  auto_reply_messages TEXT,
  auto_reply_index INTEGER
) LANGUAGE plpgsql AS $$
DECLARE
  v_link_id UUID;
  v_current_index INTEGER;
  v_total_numbers INTEGER;
  v_next_index INTEGER;
  v_phone_number VARCHAR;
  v_number_id UUID;
  v_platform VARCHAR;
  v_is_hidden BOOLEAN;
  v_tiktok_pixel_enabled BOOLEAN;
  v_tiktok_pixel_id VARCHAR;
  v_tiktok_access_token VARCHAR;
  v_auto_reply_enabled BOOLEAN;
  v_auto_reply_messages TEXT;
  v_auto_reply_index INTEGER;
BEGIN
  -- 排他锁，防止并发乱序
  SELECT id, current_index, short_links.tiktok_pixel_enabled, short_links.tiktok_pixel_id, short_links.tiktok_access_token,
         short_links.auto_reply_enabled, short_links.auto_reply_messages, short_links.auto_reply_index
    INTO v_link_id, v_current_index, v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
         v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index
  FROM short_links
  WHERE slug = p_slug AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN RETURN; END IF;

  -- 获取总数量
  SELECT COUNT(*) INTO v_total_numbers FROM whatsapp_numbers WHERE short_link_id = v_link_id AND is_active = true;
  IF v_total_numbers = 0 THEN RETURN; END IF;

  v_current_index := v_current_index % v_total_numbers;

  -- 按 sort_order, created_at, id 稳定排序取号，避免批量插入乱序
  SELECT wn.id, wn.phone_number, wn.platform, wn.is_hidden
    INTO v_number_id, v_phone_number, v_platform, v_is_hidden
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order ASC NULLS LAST, wn.created_at ASC, wn.id ASC
  LIMIT 1 OFFSET v_current_index;

  -- 推进指针
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- 幽灵号不增加总点击量
  IF v_is_hidden THEN
    UPDATE short_links
    SET current_index = v_next_index,
        auto_reply_index = short_links.auto_reply_index + 1,
        updated_at = now()
    WHERE id = v_link_id;
  ELSE
    UPDATE short_links
    SET current_index = v_next_index,
        total_clicks = short_links.total_clicks + 1,
        auto_reply_index = short_links.auto_reply_index + 1,
        updated_at = now()
    WHERE id = v_link_id;
  END IF;

  UPDATE whatsapp_numbers
  SET click_count = whatsapp_numbers.click_count + 1
  WHERE id = v_number_id;

  RETURN QUERY SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_is_hidden,
    v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
    v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index;
END;
$$;

-- 设置函数以 SECURITY DEFINER 执行（绕过 RLS）
ALTER FUNCTION increment_and_get_number(VARCHAR) SECURITY DEFINER;

-- ============================================================
-- STEP 8: 开启 Row Level Security
-- ============================================================
ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- STEP 9: RLS 策略
-- ============================================================

-- short_links
DROP POLICY IF EXISTS "Users can view own links" ON short_links;
CREATE POLICY "Users can view own links" ON short_links FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own links" ON short_links;
CREATE POLICY "Users can create own links" ON short_links FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own links" ON short_links;
CREATE POLICY "Users can update own links" ON short_links FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own links" ON short_links;
CREATE POLICY "Users can delete own links" ON short_links FOR DELETE USING (auth.uid() = user_id);

-- whatsapp_numbers
DROP POLICY IF EXISTS "Users can view own numbers" ON whatsapp_numbers;
CREATE POLICY "Users can view own numbers" ON whatsapp_numbers FOR SELECT USING (
  EXISTS (SELECT 1 FROM short_links WHERE short_links.id = whatsapp_numbers.short_link_id AND short_links.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can create numbers for own links" ON whatsapp_numbers;
CREATE POLICY "Users can create numbers for own links" ON whatsapp_numbers FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM short_links WHERE short_links.id = whatsapp_numbers.short_link_id AND short_links.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can update own numbers" ON whatsapp_numbers;
CREATE POLICY "Users can update own numbers" ON whatsapp_numbers FOR UPDATE USING (
  EXISTS (SELECT 1 FROM short_links WHERE short_links.id = whatsapp_numbers.short_link_id AND short_links.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can delete own numbers" ON whatsapp_numbers;
CREATE POLICY "Users can delete own numbers" ON whatsapp_numbers FOR DELETE USING (
  EXISTS (SELECT 1 FROM short_links WHERE short_links.id = whatsapp_numbers.short_link_id AND short_links.user_id = auth.uid())
);

-- click_logs
DROP POLICY IF EXISTS "Users can view own click logs" ON click_logs;
CREATE POLICY "Users can view own click logs" ON click_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM short_links WHERE short_links.id = click_logs.short_link_id AND short_links.user_id = auth.uid())
);

-- 公开插入（redirect 路由需要，不依赖登录状态）
DROP POLICY IF EXISTS "Allow public insert for click logs" ON click_logs;
-- 注意：此策略已被移除（第17个迁移），不再添加

-- work_orders
DROP POLICY IF EXISTS "Users can view their own work orders" ON work_orders;
CREATE POLICY "Users can view their own work orders" ON work_orders FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own work orders" ON work_orders;
CREATE POLICY "Users can create their own work orders" ON work_orders FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own work orders" ON work_orders;
CREATE POLICY "Users can update their own work orders" ON work_orders FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own work orders" ON work_orders;
CREATE POLICY "Users can delete their own work orders" ON work_orders FOR DELETE USING (auth.uid() = user_id);

-- tickets
DROP POLICY IF EXISTS "Users can view own tickets" ON tickets;
CREATE POLICY "Users can view own tickets" ON tickets FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own tickets" ON tickets;
CREATE POLICY "Users can create own tickets" ON tickets FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tickets" ON tickets;
CREATE POLICY "Users can update own tickets" ON tickets FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tickets" ON tickets;
CREATE POLICY "Users can delete own tickets" ON tickets FOR DELETE USING (auth.uid() = user_id);

-- ticket_messages
DROP POLICY IF EXISTS "Users can view messages for own tickets" ON ticket_messages;
CREATE POLICY "Users can view messages for own tickets" ON ticket_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Users can create messages for own tickets" ON ticket_messages;
CREATE POLICY "Users can create messages for own tickets" ON ticket_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tickets WHERE tickets.id = ticket_messages.ticket_id AND tickets.user_id = auth.uid())
);

-- profiles：所有人可读（让后台能查 admin 身份）
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON profiles;
CREATE POLICY "Enable read access for all users" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Root admin can see all profiles" ON public.profiles;
CREATE POLICY "Root admin can see all profiles" ON public.profiles FOR SELECT
  USING (auth.jwt()->>'email' = 'bolong6233@gmail.com');

-- user_passwords
DROP POLICY IF EXISTS "Enable insert for all users" ON public.user_passwords;
CREATE POLICY "Enable insert for all users" ON public.user_passwords FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Root admin can see all passwords" ON public.user_passwords;
CREATE POLICY "Root admin can see all passwords" ON public.user_passwords FOR SELECT
  USING (auth.jwt()->>'email' = 'bolong6233@gmail.com');

-- login_logs
DROP POLICY IF EXISTS "Users can view own login logs" ON login_logs;
CREATE POLICY "Users can view own login logs" ON login_logs FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "System can insert login logs" ON login_logs;
CREATE POLICY "System can insert login logs" ON login_logs FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- STEP 10: 初始数据 / DML
-- ============================================================

-- 同步所有已有 auth.users 到 profiles（默认 guest）
INSERT INTO public.profiles (id, email, role, status)
SELECT id, email, 'guest', 'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 将主管理员账号设置为 root
UPDATE public.profiles
SET role = 'root'
WHERE email = 'bolong6233@gmail.com';

-- ============================================================
-- STEP 11: 刷新 PostgREST Schema 缓存
-- ============================================================
NOTIFY pgrst, 'reload schema';
