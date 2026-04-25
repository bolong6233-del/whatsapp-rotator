-- Migration 022: Add unique constraint on work_orders(user_id, ticket_name)
-- Purpose: Prevent duplicate ticket names per user so that cascade-deleting
--          whatsapp_numbers by label is always safe (no cross-order collision).

-- Step 1: Check for existing duplicates (informational only, does not block)
DO $$
DECLARE
  dup_count int;
BEGIN
  SELECT COUNT(*) INTO dup_count FROM (
    SELECT user_id, ticket_name, COUNT(*) c
    FROM work_orders
    GROUP BY user_id, ticket_name
    HAVING COUNT(*) > 1
  ) sub;
  IF dup_count > 0 THEN
    RAISE NOTICE '⚠️  发现 % 组重名工单，请先人工处理后再创建唯一索引', dup_count;
  END IF;
END $$;

-- Step 2: Create unique index
-- ⚠️  If duplicates exist (see NOTICE above), this statement will fail.
-- Before deploying, run the check query below in the Supabase console:
--
--   SELECT user_id, ticket_name, COUNT(*) c
--   FROM work_orders
--   GROUP BY user_id, ticket_name
--   HAVING COUNT(*) > 1;
--
-- If any rows are returned, rename the duplicate work orders manually (keep one,
-- add a suffix to the others), then re-run this migration.
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_user_ticket_name_unique
  ON work_orders(user_id, ticket_name);
