-- Migration 011: RPC – Add missing return fields
--
-- Problem: src/app/[slug]/route.ts destructures four fields from the RPC result
-- that are NOT present in the current RETURNS TABLE definition of
-- increment_and_get_number (last updated by migration 007):
--   • tiktok_event_type
--   • fb_pixel_enabled
--   • fb_pixel_id
--   • fb_event_type
--
-- Without these columns, accessing them from rpcData[0] yields undefined,
-- which means the TikTok / Facebook pixel logic is silently broken and any
-- Supabase client that validates the return schema will report an error,
-- causing the fallback redirect ("no numbers available").
--
-- Fix applied here:
--   • Add the four missing columns to RETURNS TABLE.
--   • Declare the corresponding DECLARE variables.
--   • Read them from short_links in the SELECT … INTO statement.
--   • Include them in the final RETURN QUERY SELECT.
--
-- All other logic (SECURITY DEFINER, FOR UPDATE lock, Ghost Ledger,
-- deterministic ORDER BY, modulo wrap) is preserved from migration 007.

CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(
  phone_number          VARCHAR,
  number_id             UUID,
  link_id               UUID,
  platform              VARCHAR,
  is_hidden             BOOLEAN,
  tiktok_pixel_enabled  BOOLEAN,
  tiktok_pixel_id       VARCHAR,
  tiktok_access_token   VARCHAR,
  tiktok_event_type     TEXT,
  fb_pixel_enabled      BOOLEAN,
  fb_pixel_id           TEXT,
  fb_event_type         TEXT,
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
  v_tiktok_event_type     TEXT;
  v_fb_pixel_enabled      BOOLEAN;
  v_fb_pixel_id           TEXT;
  v_fb_event_type         TEXT;
  v_auto_reply_enabled    BOOLEAN;
  v_auto_reply_messages   TEXT;
  v_auto_reply_index      INTEGER;
BEGIN
  -- Acquire an exclusive row-level lock on the short_link row for this slug.
  -- This serialises ALL concurrent requests for the same slug: the second request
  -- blocks here until the first has committed its index update, so each caller
  -- always sees the freshly-incremented index and receives a different number.
  SELECT sl.id, sl.current_index,
         sl.tiktok_pixel_enabled, sl.tiktok_pixel_id, sl.tiktok_access_token,
         sl.tiktok_event_type,
         sl.fb_pixel_enabled, sl.fb_pixel_id, sl.fb_event_type,
         sl.auto_reply_enabled, sl.auto_reply_messages, sl.auto_reply_index
    INTO v_link_id, v_current_index,
         v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
         v_tiktok_event_type,
         v_fb_pixel_enabled, v_fb_pixel_id, v_fb_event_type,
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
  v_current_index := v_current_index % v_total_numbers;

  -- Select the number at the current position using a fully deterministic ORDER BY:
  --   sort_order ASC NULLS LAST  – respects manual ordering; NULLs go last
  --   created_at ASC             – stable secondary key (insertion order)
  --   id ASC                     – UUID tiebreaker
  SELECT wn.id, wn.phone_number, wn.platform, wn.is_hidden
    INTO v_number_id, v_phone_number, v_platform, v_is_hidden
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order ASC NULLS LAST, wn.created_at ASC, wn.id ASC
  LIMIT 1 OFFSET v_current_index;

  -- Advance the index for the next caller.
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- Ghost Ledger: hidden-number clicks must NOT increment total_clicks.
  IF v_is_hidden THEN
    UPDATE short_links
       SET current_index    = v_next_index,
           auto_reply_index = auto_reply_index + 1,
           updated_at       = now()
     WHERE id = v_link_id;
  ELSE
    UPDATE short_links
       SET current_index    = v_next_index,
           total_clicks     = total_clicks + 1,
           auto_reply_index = auto_reply_index + 1,
           updated_at       = now()
     WHERE id = v_link_id;
  END IF;

  -- Increment the individual number's counter.
  UPDATE whatsapp_numbers
     SET click_count = click_count + 1
   WHERE id = v_number_id;

  RETURN QUERY
    SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_is_hidden,
           v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
           v_tiktok_event_type,
           v_fb_pixel_enabled, v_fb_pixel_id, v_fb_event_type,
           v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index;
END;
$$;
