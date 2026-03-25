-- Migrate legacy TikTok event type values to valid options.
-- CompletePayment and ClickButton are no longer supported;
-- convert them to the safe default SubmitForm.
UPDATE short_links
SET tiktok_event_type = 'SubmitForm'
WHERE tiktok_event_type IN ('CompletePayment', 'ClickButton');
