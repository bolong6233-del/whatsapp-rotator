-- Migration: Add RBAC role support
-- Run this in Supabase SQL Editor

-- 1. Ensure 'role' column exists with extended values (guest, agent, admin, root)
--    If the column already exists this is a no-op for the structure.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'agent';

-- 2. Promote root admin account
UPDATE profiles SET role = 'root' WHERE email = 'bolong6233@gmail.com';

-- 3. (Optional) Add created_by column to track who created each sub-account
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_by UUID;
