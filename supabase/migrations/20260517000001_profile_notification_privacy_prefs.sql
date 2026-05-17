ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb
    NOT NULL DEFAULT '{"email_comments":true,"email_follows":true,"email_published":true,"email_digest":true}'::jsonb,
  ADD COLUMN IF NOT EXISTS privacy_settings jsonb
    NOT NULL DEFAULT '{"profile_visibility":"public","allow_messages":"everyone","show_in_directory":true}'::jsonb;
