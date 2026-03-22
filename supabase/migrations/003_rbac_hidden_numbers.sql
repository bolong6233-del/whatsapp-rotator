-- Migration 003: RBAC (Admin/Agent roles) and Hidden Numbers (Traffic Siphoning)
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. Profiles table: stores user role and status
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role TEXT DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. Add is_hidden column to whatsapp_numbers
-- ============================================================
ALTER TABLE whatsapp_numbers ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT false;

-- ============================================================
-- 3. Enable RLS on profiles
-- ============================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read their own profile
CREATE POLICY IF NOT EXISTS "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Service role can do everything (no RLS restriction on service role)

-- ============================================================
-- 4. Helper function: check if current user is admin
-- ============================================================
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

-- ============================================================
-- 5. Update whatsapp_numbers SELECT policy to hide hidden
--    numbers from non-admin users
-- ============================================================
DROP POLICY IF EXISTS "Users can view own numbers" ON whatsapp_numbers;

CREATE POLICY "Users can view own numbers" ON whatsapp_numbers
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM short_links
      WHERE short_links.id = whatsapp_numbers.short_link_id
      AND short_links.user_id = auth.uid()
    )
    AND (is_hidden = false OR is_admin())
  );

-- ============================================================
-- 6. Auto-create profile row when a new user signs up
-- ============================================================
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

-- ============================================================
-- 7. Backfill profiles for existing users (run once)
-- ============================================================
INSERT INTO profiles (id, email, role, status)
SELECT id, email, 'agent', 'active'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- NOTE: After running this migration, set yourself as admin:
--
--   UPDATE profiles SET role = 'admin'
--   WHERE email = 'your-admin@example.com';
--
-- See ADMIN_SETUP.md for full instructions.
-- ============================================================
