-- Retry tracking for the home-page push re-prompt banner, kept separate
-- from profiles.push_prompt_shown_at (which remains onboarding's untouched
-- one-shot stamp). last_shown_at anchors a 20-day cooldown; attempt_count
-- tracks unanswered ("default" permission) dismissals, capped at 3, with a
-- 4th sentinel value marking the one-time "manage in Settings" pointer as
-- already shown (see lib/pushPromptPolicy.ts).
alter table public.profiles
  add column if not exists push_prompt_last_shown_at timestamptz,
  add column if not exists push_prompt_attempt_count integer not null default 0;
