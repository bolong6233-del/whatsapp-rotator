-- Migration 013: Many-to-many rules fix (corrected business rules)
--
-- Business rule changes:
--   1. Same short link can run under multiple work orders; same work order can use multiple
--      short links (M:N between work_orders and short_links).
--   2. Same phone number may appear multiple times under the same short link
--      (phone numbers are deployment instances, not unique identifiers).
--   3. Anti-duplicate protection is handled by:
--        - Request-level idempotency (Idempotency-Key header + idempotency_keys table)
--        - Relation-level unique keys (work_order_short_links unique constraint)
--
-- ROLLBACK:
--   To revert this migration:
--     1. DROP TABLE IF EXISTS work_order_short_links;
--     2. ALTER TABLE whatsapp_numbers
--          ADD CONSTRAINT whatsapp_numbers_short_link_phone_unique
--          UNIQUE (short_link_id, phone_number);
--        (You must first deduplicate rows: DELETE duplicates keeping the earliest per pair.)

-- ─── Step 1: Drop the (short_link_id, phone_number) unique constraint ────────
-- This constraint wrongly blocked the legitimate business scenario where the same
-- phone number appears as multiple deployment instances under the same short link.
-- Idempotency keys now carry the sole responsibility for preventing accidental
-- double-submissions within a single request session.
ALTER TABLE whatsapp_numbers
  DROP CONSTRAINT IF EXISTS whatsapp_numbers_short_link_phone_unique;

-- ─── Step 2: Create work_order_short_links junction table ────────────────────
-- Implements the many-to-many relationship between work_orders and short_links.
-- Fields:
--   work_order_id  – FK to work_orders
--   short_link_id  – FK to short_links
--   created_at     – binding timestamp
-- Unique key (work_order_id, short_link_id) prevents binding the same pair twice.
CREATE TABLE IF NOT EXISTS work_order_short_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  short_link_id   UUID NOT NULL REFERENCES short_links(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT work_order_short_links_unique
    UNIQUE (work_order_id, short_link_id)
);

-- Index for fast look-ups by work_order_id
CREATE INDEX IF NOT EXISTS idx_wosl_work_order_id
  ON work_order_short_links (work_order_id);

-- Index for fast look-ups by short_link_id
CREATE INDEX IF NOT EXISTS idx_wosl_short_link_id
  ON work_order_short_links (short_link_id);

-- ─── Step 3: RLS for work_order_short_links ───────────────────────────────────
-- The table is accessed server-side (service role / SECURITY DEFINER) via the
-- admin client, so RLS is enabled but no direct-client policies are granted.
ALTER TABLE work_order_short_links ENABLE ROW LEVEL SECURITY;
