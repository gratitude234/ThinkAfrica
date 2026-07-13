-- Tracks whether a user has ever been offered the push-notification
-- permission prompt, from any surface (onboarding or the one-time home
-- banner for pre-existing users). NULL = never shown. Deliberately not
-- backfilled: every current user predates push entirely, so leaving this
-- NULL for all existing rows is what makes them eligible for the new
-- one-time home banner in the first place.
alter table public.profiles
  add column if not exists push_prompt_shown_at timestamptz;
