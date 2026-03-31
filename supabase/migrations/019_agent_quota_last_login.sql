-- Migration: Add max_agents quota field to profiles
-- This allows root admin to limit how many agents an admin can create.
-- NULL means no limit (default behavior).

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS max_agents INTEGER DEFAULT NULL;

-- Note: last_sign_in_at is fetched from Supabase Auth (auth.users table)
-- via the Admin API and does not require a migration.
