-- Migration 008: Fix guest role support and ensure all required columns exist
-- Run this in Supabase SQL Editor

-- ============================================================
-- 1. Fix the role CHECK constraint to allow all required roles
-- ============================================================

-- Drop the old constraint that only allowed 'admin' and 'agent'
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add a new constraint that allows all roles used in the application
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'guest', 'root', 'root_admin'));

-- ============================================================
-- 2. Add missing columns (safe to run multiple times)
-- ============================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plain_password TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID;

-- ============================================================
-- 3. Update the new-user trigger to default to 'guest' role
--    Self-registered users should land as guests, not agents.
--    Admin-created users will have their role explicitly set by
--    the upsert in /api/admin/agents, overriding this default.
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
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
  EXECUTE FUNCTION handle_new_user();
