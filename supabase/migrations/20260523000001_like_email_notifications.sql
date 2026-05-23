-- Like email notifications are created from server actions.
-- Drop the database trigger to avoid duplicate in-app like notifications.

DROP TRIGGER IF EXISTS on_like_insert ON public.likes;

ALTER TABLE public.profiles
  ALTER COLUMN notification_prefs SET DEFAULT '{
    "email_comments": true,
    "email_follows": true,
    "email_likes": true,
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
    "email_published": true,
    "email_digest": true,
    "email_account_security": true,
    "email_profile_reminders": true
  }'::jsonb || coalesce(notification_prefs, '{}'::jsonb);
