ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_inject_numbers BOOLEAN DEFAULT false;
NOTIFY pgrst, 'reload schema';
