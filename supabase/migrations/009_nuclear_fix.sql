-- ============================================================
-- Migration 009: Nuclear Fix — Guest Role, Backfill, Columns
-- Run this ONCE in Supabase → SQL Editor → Run
-- ============================================================

-- ============================================================
-- 1. Ensure role CHECK constraint allows all application roles
-- ============================================================
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check1;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'agent', 'guest', 'root', 'root_admin'));

-- ============================================================
-- 2. Add missing columns (safe to re-run — IF NOT EXISTS)
-- ============================================================
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plain_password TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS expires_at    TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_by    UUID;

-- ============================================================
-- 3. Update the new-user trigger to default new sign-ups to 'guest'
--    (self-registered users land as guests, not agents)
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
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 4. Backfill: create profile rows for auth users that have none
--    (covers users who registered before the trigger existed)
-- ============================================================
-- NOTE: bolong6233@gmail.com is the hardcoded root-admin email used
-- throughout this application.  It is intentionally excluded from the
-- guest-role backfill so it retains its manually set root/admin role.
INSERT INTO public.profiles (id, email, role, status)
SELECT u.id, u.email, 'guest', 'active'
FROM   auth.users u
WHERE  NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id)
  AND  u.email <> 'bolong6233@gmail.com'
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5. Fix self-registered accounts that ended up as 'agent'
--    A self-registered user has no created_by value.
--    We update them to 'guest' so they appear correctly and
--    cannot use agent features until the admin promotes them.
--    (Accounts explicitly created by an admin keep their role.)
-- ============================================================
UPDATE public.profiles
SET    role = 'guest'
WHERE  role = 'agent'
  AND  created_by IS NULL
  AND  email <> 'bolong6233@gmail.com';

-- ============================================================
-- 6. RLS: ensure root admin can read ALL profiles via normal client
--    (The service-role key bypasses RLS entirely, but this policy
--     also makes the dashboard layout work for the root admin.)
--
-- NOTE on email-based RLS policies: Using a role check (e.g.
--   "SELECT role FROM profiles WHERE id = auth.uid()") inside an RLS
--   policy on the profiles table itself would cause infinite recursion.
--   The email check via auth.jwt() is the standard Supabase pattern for
--   granting a known super-admin elevated access without recursion.
-- ============================================================
DROP POLICY IF EXISTS "Root admin can see all profiles" ON public.profiles;
CREATE POLICY "Root admin can see all profiles"
  ON public.profiles FOR SELECT
  USING (auth.jwt()->>'email' = 'bolong6233@gmail.com');

-- Allow every authenticated user to read their own profile row
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

-- Allow every authenticated user to update their own profile row
DROP POLICY IF EXISTS "Users can update own profile"       ON public.profiles;
DROP POLICY IF EXISTS "Enable update for users based on email" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id OR auth.jwt()->>'email' = 'bolong6233@gmail.com');

-- ============================================================
-- Done.  After running this migration:
--   • New self-registrations will default to 'guest' role.
--   • Existing self-registered 'agent' accounts are now 'guest'.
--   • The root admin (bolong6233@gmail.com) can see all profiles.
--   • The /api/admin/agents endpoint (service-role key) will
--     return every row from profiles regardless of RLS.
-- ============================================================
