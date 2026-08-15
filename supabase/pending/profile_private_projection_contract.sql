-- DO NOT APPLY AS AN EXECUTABLE MIGRATION YET.
--
-- Phase 0 profile SELECT contract candidate. This is the CONTRACT half of
-- 20260815000001_profile_security_hardening.sql and must remain in
-- supabase/pending until all of the following are true in staging:
--
--   1. 20260815000001 and 20260815000002 are applied and catalog-verified.
--   2. The application version using get_my_profile_private() is deployed.
--   3. Settings, onboarding, notifications, subscriptions, the home push
--      seed, public profiles, search, feeds, debates, and admin surfaces pass.
--   4. A source scan confirms ordinary clients no longer select the private
--      columns revoked below.
--
-- Promote this file by copying its reviewed contents to a NEW timestamped
-- forward migration. Never rename this candidate in place or edit an applied
-- migration.

BEGIN;

-- Table-level SELECT implicitly covers every present and future column. Remove
-- it before granting the reviewed public projection one column at a time.
REVOKE SELECT ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

-- Defense in depth if an environment accumulated old column grants.
REVOKE SELECT (
  signup_email,
  notification_prefs,
  privacy_settings,
  onboarding_completed,
  onboarding_completed_at,
  suspended_at,
  suspended_reason,
  last_engagement_push_notified_at,
  last_comment_email_notified_at,
  push_prompt_shown_at,
  push_prompt_last_shown_at,
  push_prompt_attempt_count
) ON TABLE public.profiles FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  id,
  username,
  full_name,
  country,
  university,
  field_of_study,
  profile_type,
  secondary_profile_types,
  organization_name,
  professional_title,
  organization_website,
  bio,
  avatar_url,
  cover_image_url,
  interests,
  graduation_year,
  is_alumni,
  open_to_mentoring,
  verified,
  verified_type,
  role,
  points,
  created_at
) ON TABLE public.profiles TO anon, authenticated;

-- Service-role access is intentionally unchanged. RLS from 00001 still owns
-- row visibility; this candidate owns only the column boundary.

COMMIT;

