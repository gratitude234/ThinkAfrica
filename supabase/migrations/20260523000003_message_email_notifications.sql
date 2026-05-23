ALTER TABLE public.conversation_participants
  ADD COLUMN IF NOT EXISTS last_email_notified_at timestamptz;

ALTER TABLE public.profiles
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "email_comments": true,
    "email_follows": true,
    "email_likes": true,
    "email_responses": true,
    "email_messages": true,
    "email_published": true,
    "email_digest": true,
    "email_account_security": true,
    "email_profile_reminders": true
  }'::jsonb;

UPDATE public.profiles
SET notification_prefs =
  '{
    "email_comments": true,
    "email_follows": true,
    "email_likes": true,
    "email_responses": true,
    "email_messages": true,
    "email_published": true,
    "email_digest": true,
    "email_account_security": true,
    "email_profile_reminders": true
  }'::jsonb || coalesce(notification_prefs, '{}'::jsonb);
