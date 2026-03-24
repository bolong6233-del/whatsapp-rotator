-- Migration 012: Three-layer anti-duplicate submission protection (DB layer)
-- This migration adds:
--   1. Unique constraint on whatsapp_numbers(short_link_id, phone_number)
--   2. Unique index on work_orders for business deduplication
--   3. idempotency_keys table for backend idempotency (Layer 2 storage)
--
-- BEFORE applying: run the cleanup CTEs below to remove historical duplicates.
-- Each CTE keeps the EARLIEST row (lowest created_at / smallest id) and deletes the rest.

-- ─── Step 1: Clean up duplicate whatsapp_numbers rows ────────────────────────
-- Keep the earliest duplicate; remove later ones with the same (short_link_id, phone_number).
DELETE FROM whatsapp_numbers
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY short_link_id, phone_number
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM whatsapp_numbers
  ) ranked
  WHERE rn > 1
);

-- ─── Step 2: Unique constraint on whatsapp_numbers(short_link_id, phone_number) ──
-- Prevents any duplicate phone number within the same short link, regardless of
-- how the insert reaches the database (direct Supabase client, API route, or migration).
ALTER TABLE whatsapp_numbers
  ADD CONSTRAINT whatsapp_numbers_short_link_phone_unique
  UNIQUE (short_link_id, phone_number);

-- ─── Step 3: Clean up duplicate work_orders rows ─────────────────────────────
-- Deduplication key: (user_id, ticket_link, distribution_link_slug, start_time).
-- Rationale: the combination of "who created it + which ticket + which short link + when
-- it starts" uniquely identifies a business work order. An operator should never need
-- two active orders for the exact same slot. We keep the earliest row.
DELETE FROM work_orders
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY user_id, ticket_link, distribution_link_slug, start_time
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM work_orders
  ) ranked
  WHERE rn > 1
);

-- ─── Step 4: Unique index on work_orders ─────────────────────────────────────
-- Using a partial unique index with NULLS NOT DISTINCT (PG 15+).
-- If distribution_link_slug or start_time can be NULL in legitimate scenarios,
-- those rows are excluded from the constraint (PG treats two NULLs as distinct
-- by default; NULLS NOT DISTINCT changes that so NULLs also conflict).
-- We use NULLS NOT DISTINCT to catch NULL-field duplicates as well.
CREATE UNIQUE INDEX IF NOT EXISTS work_orders_business_dedup_idx
  ON work_orders (user_id, ticket_link, distribution_link_slug, start_time)
  NULLS NOT DISTINCT;

-- ─── Step 5: idempotency_keys table ──────────────────────────────────────────
-- Stores the result of every idempotent write request so that retries with the
-- same Idempotency-Key return the cached response instead of re-executing the
-- business logic. Records expire after 24 hours (tunable via expires_at).
CREATE TABLE IF NOT EXISTS idempotency_keys (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL,
  endpoint         TEXT    NOT NULL,  -- e.g. 'POST /api/links'
  idempotency_key  TEXT    NOT NULL,
  request_hash     TEXT    NOT NULL,  -- SHA-256 of the request body for mismatch detection
  status           TEXT    NOT NULL DEFAULT 'processing'
                   CHECK (status IN ('processing', 'succeeded', 'failed')),
  response_status  INTEGER,           -- HTTP status code of the original response
  response_body    JSONB,             -- Serialised response body
  resource_type    TEXT,              -- e.g. 'short_link', 'whatsapp_number', 'work_order'
  resource_id      UUID,              -- PK of the created resource
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),

  -- Primary deduplication constraint: one key per (user, endpoint)
  CONSTRAINT idempotency_keys_user_endpoint_key_unique
    UNIQUE (user_id, endpoint, idempotency_key)
);

-- Index for efficient lookup during request processing
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_lookup
  ON idempotency_keys (user_id, endpoint, idempotency_key);

-- Index for TTL cleanup jobs (can periodically DELETE WHERE expires_at < now())
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON idempotency_keys (expires_at);

-- updated_at trigger reuse
CREATE TRIGGER update_idempotency_keys_updated_at
  BEFORE UPDATE ON idempotency_keys
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ─── Step 6: RLS for idempotency_keys ────────────────────────────────────────
-- The table is only accessed server-side (service role / SECURITY DEFINER),
-- so we enable RLS but grant no policies to regular users.
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
