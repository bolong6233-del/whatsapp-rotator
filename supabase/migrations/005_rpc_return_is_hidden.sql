-- Migration 005: Return is_hidden from increment_and_get_number RPC
--
-- Adds is_hidden to the RPC return value so that the application layer
-- can decide whether to insert a row into click_logs.
-- When is_hidden = true, the redirect engine will skip the click_logs
-- insert entirely, so agents cannot see hidden-number visits in access logs.

CREATE OR REPLACE FUNCTION increment_and_get_number(p_slug VARCHAR)
RETURNS TABLE(
  phone_number VARCHAR,
  number_id UUID,
  link_id UUID,
  platform VARCHAR,
  is_hidden BOOLEAN,
  tiktok_pixel_enabled BOOLEAN,
  tiktok_pixel_id VARCHAR,
  tiktok_access_token VARCHAR,
  auto_reply_enabled BOOLEAN,
  auto_reply_messages TEXT,
  auto_reply_index INTEGER
) AS $$
DECLARE
  v_link_id UUID;
  v_current_index INTEGER;
  v_total_numbers INTEGER;
  v_next_index INTEGER;
  v_phone_number VARCHAR;
  v_number_id UUID;
  v_platform VARCHAR;
  v_is_hidden BOOLEAN;
  v_tiktok_pixel_enabled BOOLEAN;
  v_tiktok_pixel_id VARCHAR;
  v_tiktok_access_token VARCHAR;
  v_auto_reply_enabled BOOLEAN;
  v_auto_reply_messages TEXT;
  v_auto_reply_index INTEGER;
BEGIN
  -- Get and lock the short link
  SELECT id, current_index, short_links.tiktok_pixel_enabled, short_links.tiktok_pixel_id, short_links.tiktok_access_token,
         short_links.auto_reply_enabled, short_links.auto_reply_messages, short_links.auto_reply_index
    INTO v_link_id, v_current_index, v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token,
         v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index
  FROM short_links
  WHERE slug = p_slug AND is_active = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Count all active numbers (hidden + visible)
  SELECT COUNT(*) INTO v_total_numbers
  FROM whatsapp_numbers
  WHERE short_link_id = v_link_id AND is_active = true;

  IF v_total_numbers = 0 THEN
    RETURN;
  END IF;

  -- Sequential rotation across ALL active numbers (hidden ones are mixed in transparently)
  v_current_index := v_current_index % v_total_numbers;

  SELECT wn.id, wn.phone_number, wn.platform, wn.is_hidden INTO v_number_id, v_phone_number, v_platform, v_is_hidden
  FROM whatsapp_numbers wn
  WHERE wn.short_link_id = v_link_id AND wn.is_active = true
  ORDER BY wn.sort_order, wn.created_at
  LIMIT 1 OFFSET v_current_index;

  -- Calculate next index
  v_next_index := (v_current_index + 1) % v_total_numbers;

  -- Ghost Ledger: only increment total_clicks when the assigned number is NOT hidden.
  -- Hidden-number clicks are invisible to the agent (filtered in the stats API too),
  -- so the agent's click count, log count, and actual lead count stay perfectly in sync.
  IF v_is_hidden THEN
    UPDATE short_links
    SET current_index = v_next_index,
        auto_reply_index = short_links.auto_reply_index + 1,
        updated_at = now()
    WHERE id = v_link_id;
  ELSE
    UPDATE short_links
    SET current_index = v_next_index,
        total_clicks = short_links.total_clicks + 1,
        auto_reply_index = short_links.auto_reply_index + 1,
        updated_at = now()
    WHERE id = v_link_id;
  END IF;

  -- Always increment the number's own click_count
  UPDATE whatsapp_numbers
  SET click_count = whatsapp_numbers.click_count + 1
  WHERE id = v_number_id;

  RETURN QUERY SELECT v_phone_number, v_number_id, v_link_id, v_platform, v_is_hidden, v_tiktok_pixel_enabled, v_tiktok_pixel_id, v_tiktok_access_token, v_auto_reply_enabled, v_auto_reply_messages, v_auto_reply_index;
END;
$$ LANGUAGE plpgsql;
