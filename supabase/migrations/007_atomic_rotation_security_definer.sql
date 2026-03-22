-- Migration 007: Atomic Rotation – SECURITY DEFINER + Concurrency Hardening
--
-- Problem: Under high concurrency (dozens–hundreds of clicks per minute from ad traffic),
-- multiple simultaneous requests could read the same current_index and assign the same
-- number, producing sequences like 1,3,2,1,2,2,3,2,2 instead of 1,2,3,1,2,3.
--
-- Root cause (fully addressed here):
--   1. ORDER BY non-determinism – fixed in migration 006 (sort_order NULLS LAST + id tiebreaker).
--   2. Missing SECURITY DEFINER – if route.ts falls back to the anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY)
--      because SUPABASE_SERVICE_ROLE_KEY is not set, the function runs under the caller's
--      restricted role and RLS may block the UPDATE on short_links, silently aborting the
--      index advance and causing the same index to be reused on every request.
--
-- Fix applied here:
--   • SECURITY DEFINER: the function always executes with the privileges of its owner
--     (the database superuser / postgres role), bypassing RLS for the duration of the
--     call.  This guarantees the FOR UPDATE lock + index advance succeed regardless of
--     which API key the caller uses.
--   • SET search_path = public, pg_catalog: mandatory security hygiene for every
--     SECURITY DEFINER function – prevents search-path injection attacks.
--
-- New-number injection note (Issue 2):
--   When a new WhatsApp number is added to a link that already has N clicks, the modulo
--   logic naturally starts 1:1 fair rotation immediately:
--     current_index=100, total=2  →  100 % 2 = 0  (old number)
--     current_index=101, total=2  →  101 % 2 = 1  (new number)
--   The new number does NOT "gorge" on catch-up clicks; it simply joins the round-robin.
--
-- Run this once in the Supabase SQL Editor (or via `supabase db push`).

CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(
  phone_number    VARCHAR,
  number_id       UUID,
  link_id         UUID,
  platform        VARCHAR,
  is_hidden       BOOLEAN,
  tiktok_pixel_enabled  BOOLEAN,
  tiktok_pixel_id       VARCHAR,
  tiktok_access_token   VARCHAR,
  auto_reply_enabled    BOOLEAN,
  auto_reply_messages   TEXT,
  auto_reply_index      INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_link_id               UUID;
  v_current_index         INTEGER;
  v_total_numbers         INTEGER;
  v_next_index            INTEGER;
  v_phone_number          VARCHAR;
  v_number_id             UUID;
  v_platform              VARCHAR;
  v_is_hidden             BOOLEAN;
  v_tiktok_pixel_enabled  BOOLEAN;
  v_tiktok_pixel_id       VARCHAR;
  v_tiktok_access_token   VARCHAR;
  v_auto_reply_enabled    BOOLEAN;
  v_auto_reply_messages   TEXT;
  v_auto_reply_index      INTEGER;
BEGIN
  -- Acquire an exclusive row-level lock on the short_link row for this slug.
  -- This serialises ALL concurrent requests for the same slug: the second request
  -- blocks here until the first has committed its index update, so each caller
  -- always sees the freshly-incremented index and receives a different number.
  SELECT id, current_index,
         sl.tiktok_pixel_enabled, sl.tiktok_pixel_id, sl.tiktok_access_token,
         sl.auto_reply_enabled, sl.auto_reply_messages, sl.auto_reply_index
    INTO v_link_id, v_current_index,
         v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
         v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index
  FROM short_links sl
  WHERE sl.slug = p_slug AND sl.is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count ALL active numbers (visible + hidden) so hidden numbers participate
  -- in rotation without being visible to the agent.
  SELECT COUNT(*) INTO v_total_numbers
  FROM whatsapp_numbers
  WHERE short_link_id = v_link_id AND is_active = true;

  IF v_total_numbers = 0 THEN
    RETURN;
  END IF;

  -- Wrap the stored index into [0, total_numbers).
  -- This also handles new-number injection gracefully: if total grew from N to N+1,
  -- the existing current_index simply wraps into the new range and fair 1:1 rotation
  -- starts immediately without any "catch-up" burst to the new number.
  v_current_index := v_current_index % v_total_numbers;

  -- Select the number at the current position using a fully deterministic ORDER BY:
  --   sort_order ASC NULLS LAST  – respects manual ordering; NULLs go last
  --   created_at ASC             – stable secondary key (insertion order)
  --   id ASC                     – UUID tiebreaker; guarantees uniqueness even when
  --                                sort_order and created_at are identical
  SELECT wn.id, wn.phone_number, wn.platform, wn.is_hidden
    INTO v_number_id, v_phone_number, v_platform, v_is_hidden
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order ASC NULLS LAST, wn.created_at ASC, wn.id ASC
  LIMIT 1 OFFSET v_current_index;

  -- Advance the index for the next caller.
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- Ghost Ledger: hidden-number clicks must NOT increment total_clicks so the agent's
  -- visible click count, log count, and actual lead count stay perfectly in sync.
  IF v_is_hidden THEN
    UPDATE short_links
       SET current_index  = v_next_index,
           auto_reply_index = auto_reply_index + 1,
           updated_at     = now()
     WHERE id = v_link_id;
  ELSE
    UPDATE short_links
       SET current_index  = v_next_index,
           total_clicks   = total_clicks + 1,
           auto_reply_index = auto_reply_index + 1,
           updated_at     = now()
     WHERE id = v_link_id;
  END IF;

  -- Increment the individual number's counter (best-effort; lost updates on this
  -- secondary counter are acceptable and do not affect rotation correctness).
  UPDATE whatsapp_numbers
     SET click_count = click_count + 1
   WHERE id = v_number_id;

  RETURN QUERY
    SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_is_hidden,
           v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
           v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index;
END;
$$;
